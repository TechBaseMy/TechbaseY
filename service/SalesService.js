const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const Log = require("../util/Log");
const MemberService = require("../service/MemberService");
const ProductService = require("../service/ProductService");
const { addMonths } = require("date-fns");
const moment = require("moment-timezone");
const Constants = require("../util/Constant");
const OSS = require("../lib/OSS");
const { format } = require("date-fns-tz");
const QueryHandler = require("../lib/Query/QueryHandler");

class SalesService {
  static async validateRefundAmount(salesID) {
    const query = `
      DECLARE @PAID DECIMAL(18,2);
      DECLARE @REFUNDED DECIMAL(18,2);

      SELECT @PAID = ISNULL(SUM(SP.Amount), 0)
      FROM tbl_SalesPayment SP WITH (NOLOCK)
      WHERE SP.SalesId = :salesID AND SP.IsDeleted = 0 AND SP.StatusX = 'A'

      SELECT @REFUNDED = ISNULL(SUM(R.Amount), 0)
      FROM tbl_Refund R WITH (NOLOCK)
      WHERE R.RelateSalesID = :salesID AND R.IsDeleted = 0

      SELECT @PAID - @REFUNDED AS 'Total';    
    `;
    const result = await sequelize.query(query, {
      replacements: { salesID: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.Total;
  }
  static async validateBookingSalesID(salesID) {
    const query = `
    SELECT SalesID, SalesType FROM tbl_Sales WITH (NOLOCK) WHERE IsDeleted = 0 AND SalesID = :salesID
    `;
    const result = await sequelize.query(query, {
      replacements: { salesID: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    if (!(result[0]?.SalesID === undefined || result[0]?.SalesID === null)) {
      return result[0].SalesType === "6" || result[0].SalesType === "7";
    } else {
      return false;
    }
  }
  static async validateSalesID(salesID) {
    const query = `
    SELECT SalesID FROM tbl_Sales WITH (NOLOCK) WHERE IsDeleted = 0 AND SalesID = :salesID
    `;
    const result = await sequelize.query(query, {
      replacements: { salesID: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.SalesID === undefined || result[0]?.SalesID === null;
  }
  static async validateSalesTransactionID(salesID, transactionID) {
    const query = `
    SELECT TransactionID FROM tbl_SalesPayment WITH (NOLOCK) WHERE IsDeleted = 0 AND SalesId = :salesID AND TransactionID = :TransactionID AND StatusX = 'P'
    `;
    const result = await sequelize.query(query, {
      replacements: { salesID: salesID, TransactionID: transactionID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.TransactionID === undefined || result[0]?.TransactionID === null;
  }
  static async validateSalesInstallmentPayment(salesID, transactionID) {
    const query = `
    SELECT TransactionID FROM tbl_SalesPayment WITH (NOLOCK) 
    WHERE IsDeleted = 0 AND SalesId = :salesID 
    AND TransactionID = :TransactionID AND StatusX = 'P' AND PaymentPurpose = 2
    `;
    const result = await sequelize.query(query, {
      replacements: { salesID: salesID, TransactionID: transactionID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.TransactionID === undefined || result[0]?.TransactionID === null;
  }
  static async validateIsFirstSales(salesID) {
    const query = `
      SELECT MI.AgentID, MI.MemberID
      FROM tbl_MemberInfo MI WITH (NOLOCK)
      LEFT JOIN tbl_Sales S WITH (NOLOCK) 
        ON S.MemberId = MI.MemberId AND S.IsDeleted = 0
      WHERE MI.IsDeleted = 0 AND S.SalesId = :salesID AND S.SalesType != '1';
    `;
    const result = await sequelize.query(query, {
      replacements: { salesID: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });

    return {
      memberID: result[0]?.MemberID || null,
      agentID: result[0]?.AgentID || null,
      isFirstSales: result.length === 0 ? false : result[0]?.AgentID == null,
    };
  }
  static async checkIfSalesIsEligibleForInstallment(salesID) {
    const query = `
    SELECT sp.TransactionID
    FROM tbl_Sales s WITH (NOLOCK)
    INNER JOIN tbl_SalesPayment sp WITH (NOLOCK) 
        ON sp.IsDeleted = 0 AND sp.SalesId = s.SalesId
        AND sp.PaymentPurpose = 1 AND sp.StatusX = 'A'
    WHERE s.IsDeleted = 0 AND s.StatusX = 'A' AND s.SalesId = :SalesID AND s.SalesType IN (2, 3)
    `;
    const result = await sequelize.query(query, {
      replacements: { SalesID: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.TransactionID === undefined || result[0]?.TransactionID === null;
  }
  static async getTransactionIDBySalesID(salesID) {
    const query = `
    SELECT TransactionID FROM tbl_SalesPayment WITH (NOLOCK) WHERE IsDeleted = 0 AND SalesID = :SalesID
    `;
    const result = await sequelize.query(query, {
      replacements: { SalesID: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.TransactionID;
  }
  static async checkIfTransactionHasExistingReceipt(transID) {
    const query = `
    SELECT 1 AS 'RES' FROM tbl_SalesPayment WITH (NOLOCK) WHERE IsDeleted = 0 AND TransactionID = :TranID AND Receipt IS NOT NULL
    `;
    const result = await sequelize.query(query, {
      replacements: { TranID: transID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.RES != null;
  }
  static async getSalesBySalesID(salesID) {
    const query = `
    SELECT * FROM tbl_Sales WITH (NOLOCK) WHERE IsDeleted = 0 AND SalesID = :SalesID
    `;
    const result = await sequelize.query(query, {
      replacements: { SalesID: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  static async getPendingPaymentList(data) {
    const offset = (data.pageNumber - 1) * data.pageSize;
    const replacements = { offset: offset, pageSize: data.pageSize };

    let query = `
    FROM tbl_Sales s WITH (NOLOCK)
    INNER JOIN tbl_SalesPayment sp WITH (NOLOCK) ON sp.IsDeleted = 0 AND sp.SalesId = s.SalesId AND sp.StatusX = 'P' AND sp.PaymentPurpose <> 2
    INNER JOIN tbl_MemberInfo ma WITH (NOLOCK) ON ma.IsDeleted = 0 AND ma.MemberId = s.MemberID
    INNER JOIN tbl_MemberInfo mp WITH (NOLOCK) ON mp.IsDeleted = 0 AND mp.MemberId = s.PurchaserID
    LEFT JOIN tbl_Parameter p1 WITH (NOLOCK) ON p1.Category = 'PaymentType' AND p1.ParameterValue = s.PaymentType
    LEFT JOIN tbl_Parameter p2 WITH (NOLOCK) ON p2.Category = 'PaymentPurpose' AND p2.ParameterValue = sp.PaymentPurpose
    LEFT JOIN tbl_Parameter p3 WITH (NOLOCK) ON p3.Category = 'SalesType' AND p3.ParameterValue = s.SalesType
    WHERE s.IsDeleted = 0 AND s.StatusX = 'P' AND s.SalesType <> '1'
    `;

    if (data.dateFrom != null && data.dateFrom !== "") {
      query += `
      AND sp.TransactionDate >= :DateFrom
      `;
      replacements.DateFrom = data.dateFrom;
    }

    if (data.dateTo != null && data.dateTo !== "") {
      query += `
      AND sp.TransactionDate <= >:DateTo
      `;
      replacements.DateTo = data.dateTo;
    }

    if (data.agentID != null && data.agentID !== "") {
      query += `
      AND (s.MemberID = :AgentID OR ma.AgentID = :AgentID)
      `;
      replacements.AgentID = data.agentID;
    }

    if (data.purchaserID != null && data.purchaserID !== "") {
      query += `
      AND s.PurchaserID = :PurchaserID
      `;
      replacements.PurchaserID = data.purchaserID;
    }

    if (data.lotNo != null && data.lotNo !== "") {
      query += `
      AND s.UnitID = :LotNo
      `;
      replacements.LotNo = data.lotNo;
    }

    if (data.salesType != null && data.salesType > 1) {
      query += `
      AND s.SalesType = :SalesType
      `;
      replacements.SalesType = data.salesType;
    }

    if (data.paymentPurpose != null && data.paymentPurpose !== 0) {
      query += `
      AND sp.PaymentPurpose = :PaymentPurpose
      `;
      replacements.PaymentPurpose = data.paymentPurpose;
    }

    const countQuery = `
        SELECT COUNT(*) AS Total
        ${query} 
    `;

    query = `
      SELECT 
        s.SalesId, s.MemberId AS 'AgentID', ISNULL(ma.Fullname, '-') AS 'AgentName', 
        s.PurchaserID, ISNULL(mp.Fullname, '-') AS 'PurchaserName',
        ISNULL(p3.ParameterName, '-') AS 'SalesType', ISNULL(s.UnitID, '-') AS 'Lot_No', 
        ISNULL(p1.ParameterName, '-') AS 'PaymentMethod', ISNULL(p2.ParameterName, '-') AS 'PaymentPurpose', 
        sp.Amount AS 'PaymentAmount',
        ISNULL(s.Remarks, '-') AS 'Remarks', ISNULL(sp.Receipt, '-') AS 'ReceiptURL',
        CONVERT(VARCHAR, s.SalesDate, 120) AS 'SalesDate', CONVERT(VARCHAR, sp.TransactionDate, 120) AS 'TransactionDate'
      ${query}
    `;

    query += `
    ORDER BY s.Id
    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
    `;

    const result = await sequelize.query(query, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    const totalCount = await sequelize.query(countQuery, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    return { data: result, totalRows: totalCount[0].Total };
  }

  static async getPendingInstallmentPaymentList(data) {
    const offset = (data.pageNumber - 1) * data.pageSize;
    const replacements = { offset: offset, pageSize: data.pageSize };

    let query = `
    FROM tbl_Sales s WITH (NOLOCK)
    INNER JOIN tbl_SalesPayment sp WITH (NOLOCK) ON sp.IsDeleted = 0 AND sp.SalesId = s.SalesId AND sp.StatusX = 'P' AND sp.PaymentPurpose = 2
    INNER JOIN tbl_MemberInfo ma WITH (NOLOCK) ON ma.IsDeleted = 0 AND ma.MemberId = s.MemberID
    INNER JOIN tbl_MemberInfo mp WITH (NOLOCK) ON mp.IsDeleted = 0 AND mp.MemberId = s.PurchaserID
    LEFT JOIN tbl_Parameter p1 WITH (NOLOCK) ON p1.Category = 'PaymentType' AND p1.ParameterValue = s.PaymentType
    LEFT JOIN tbl_Parameter p3 WITH (NOLOCK) ON p3.Category = 'SalesType' AND p3.ParameterValue = s.SalesType
    WHERE s.IsDeleted = 0 AND s.StatusX = 'A' AND s.SalesType IN (2, 3) 
    `;

    if (data.dateFrom != null && data.dateFrom !== "") {
      query += `
      AND sp.TransactionDate >= :DateFrom
      `;
      replacements.DateFrom = data.dateFrom;
    }

    if (data.dateTo != null && data.dateTo !== "") {
      query += `
      AND sp.TransactionDate <= >:DateTo
      `;
      replacements.DateTo = data.dateTo;
    }

    if (data.agentID != null && data.agentID !== "") {
      query += `
      AND (s.MemberID = :AgentID OR ma.AgentID = :AgentID)
      `;
      replacements.AgentID = data.agentID;
    }

    if (data.purchaserID != null && data.purchaserID !== "") {
      query += `
      AND s.PurchaserID = :PurchaserID
      `;
      replacements.PurchaserID = data.purchaserID;
    }

    if (data.lotNo != null && data.lotNo !== "") {
      query += `
      AND s.UnitID = :LotNo
      `;
      replacements.LotNo = data.lotNo;
    }

    if (data.salesType != null && data.salesType > 1) {
      query += `
      AND s.SalesType = :SalesType
      `;
      replacements.SalesType = data.salesType;
    }

    if (data.transactionID != null && data.transactionID !== "") {
      query += `
      AND sp.TransactionID = :TransactionID
      `;
      replacements.TransactionID = data.transactionID;
    }

    if (data.salesID != null && data.salesID !== "") {
      query += `
      AND s.SalesId = :SalesID
      `;
      replacements.SalesID = data.salesID;
    }

    const countQuery = `
        SELECT COUNT(*) AS Total
        ${query} 
    `;

    query = `
      SELECT 
        s.SalesId, sp.TransactionID, s.MemberId AS 'AgentID', ISNULL(ma.Fullname, '-') AS 'AgentName', 
        s.PurchaserID, ISNULL(mp.Fullname, '-') AS 'PurchaserName',
        ISNULL(p3.ParameterName, '-') AS 'SalesType', ISNULL(s.UnitID, '-') AS 'Lot_No', 
        ISNULL(p1.ParameterName, '-') AS 'PaymentMethod', sp.Amount AS 'PaymentAmount',
        ISNULL(s.Remarks, '-') AS 'Remarks', ISNULL(sp.Receipt, '-') AS 'ReceiptURL',
        CONVERT(VARCHAR, s.SalesDate, 120) AS 'SalesDate', CONVERT(VARCHAR, sp.TransactionDate, 120) AS 'TransactionDate'
      ${query}
    `;

    query += `
    ORDER BY s.Id
    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
    `;

    const result = await sequelize.query(query, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    const totalCount = await sequelize.query(countQuery, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    return { data: result, totalRows: totalCount[0].Total };
  }

  static async getPaymentList(data) {
    const offset = (data.pageNumber - 1) * data.pageSize;
    const replacements = { offset: offset, pageSize: data.pageSize };

    let query = `
    FROM (
      SELECT 
        ISNULL(s.UnitID, '-') AS 'LotNo', s.SalesId, s.MemberID AS 'AgentMemberID', ma.AgentID AS 'AgentID',
        s.PurchaserID, ISNULL(mp.Fullname, '-') AS 'PurchaserName', CONVERT(VARCHAR, s.SalesDate, 120) AS 'SalesDate',
        CASE WHEN s.SalesType <> 2 
		      THEN (CASE WHEN uc.UnitID IS NOT NULL THEN '10003' ELSE '0' END)
          ELSE (CASE WHEN uc.UnitID IS NOT NULL THEN uc.CategoryID ELSE '0' END)
          END AS 'Category',
        CASE WHEN s.SalesType = 2 
          THEN (up.UnitPrice + up.MaintenanceFee - up.UnitDiscount + up.Downpayment)
          ELSE ISNULL((fp.TotalPrice + fp.MaintenanceFee - fp.UnitDiscount + fp.Downpayment), 0) END AS 'PurchasePrice',
        ISNULL(sp.TotalPayment, 0) AS 'TotalPayment',
        (ISNULL(expectedInstallment.CurrentTotal, 0) + ISNULL((CASE WHEN s.SalesType = 2 THEN up.Downpayment ELSE fp.Downpayment END), 0)) AS 'ExpectedCollection',
        ((CASE WHEN s.SalesType = 2 THEN (up.UnitPrice + up.MaintenanceFee - up.UnitDiscount + up.Downpayment)
        ELSE ISNULL((fp.TotalPrice + fp.MaintenanceFee - fp.UnitDiscount + fp.Downpayment), 0) END) - ISNULL(sp.TotalPayment, 0)) AS 'TotalBalance',
        CAST(ISNULL(lastPaidInstallment.InstallmentNo, 0) AS VARCHAR) + '/' + CAST(total.TotalInstallment AS VARCHAR) AS 'PaymentProgress',
        CONVERT(VARCHAR, nextInstallment.DueDate, 23) AS 'NextInstallmentDue',
        CASE WHEN ISNULL(lastPaidInstallment.InstallmentNo, 0) + 1 = ISNULL(nextInstallment.InstallmentNo, (total.TotalInstallment + 1))
        THEN (CASE WHEN nextInstallment.DueDate IS NULL THEN 'Completed' ELSE 'Up to date' END)
        ELSE 'Overdue' END AS 'InstallmentStatus'
      FROM tbl_Sales s WITH (NOLOCK)
      INNER JOIN tbl_MemberInfo mp WITH (NOLOCK) ON mp.IsDeleted = 0 AND mp.MemberId = s.PurchaserID
      INNER JOIN tbl_MemberInfo ma WITH (NOLOCK) ON ma.IsDeleted = 0 AND ma.MemberId = s.MemberId
      LEFT JOIN tbl_UnitCollection uc WITH (NOLOCK) ON uc.IsDeleted = 0 AND uc.UnitID = s.UnitID
      LEFT JOIN tbl_UnitPODetails up WITH (NOLOCK) ON up.IsDeleted = 0 AND up.SalesId = s.SalesId
      LEFT JOIN tbl_FSPPODetails fp WITH (NOLOCK) ON fp.IsDeleted =  0 AND fp.SalesId = s.SalesId
      OUTER APPLY (
        SELECT SUM(a.Amount) AS 'TotalPayment'
        FROM tbl_SalesPayment a WITH (NOLOCK)
        WHERE a.IsDeleted = 0 AND a.SalesId = s.SalesId AND a.StatusX = 'A'
      ) AS sp
      OUTER APPLY (
        SELECT TOP 1 InstallmentNo
        FROM tbl_SalesInstallment s1 WITH (NOLOCK)
        WHERE s1.IsDeleted = 0 AND s1.SalesID = s.SalesId
      ) AS installment
      OUTER APPLY (
        SELECT TOP 1 b.DueDate, b.InstallmentNo
        FROM tbl_SalesInstallment b WITH (NOLOCK)
        WHERE b.IsDeleted = 0 AND b.SalesId = s.SalesId AND b.DueDate > GETDATE()
      ) AS nextInstallment
      OUTER APPLY (
        SELECT TOP 1 
          CASE WHEN c.InstallmentNo = 0 THEN 1 ELSE c.InstallmentNo END AS 'InstallmentNo'
        FROM tbl_SalesInstallment c WITH (NOLOCK)
        WHERE c.IsDeleted = 0 AND c.SalesId = s.SalesId AND c.IsPaid = 1
        ORDER BY c.InstallmentNo DESC
      ) AS lastPaidInstallment
      OUTER APPLY (
        SELECT SUM(d.Amount) AS 'CurrentTotal'
        FROM tbl_SalesInstallment d WITH (NOLOCK)
        WHERE d.IsDeleted = 0 AND d.SalesId = s.SalesId AND d.InstallmentNo <= nextInstallment.InstallmentNo
      ) AS expectedInstallment
      OUTER APPLY (
        SELECT 
          COUNT(InstallmentNo) AS 'TotalInstallment'
        FROM tbl_SalesInstallment e WITH (NOLOCK)
        WHERE e.IsDeleted = 0 AND e.SalesId = s.SalesId
      ) AS total
      WHERE s.IsDeleted = 0 AND s.SalesType IN (2, 3) AND installment.InstallmentNo IS NOT NULL
    ) AS a WHERE 1 = 1
    `;

    if (data.agentID != null && data.agentID !== "") {
      query += `
        AND (a.AgentID = :AgentID OR a.AgentMemberID = :AgentID)
      `;
      replacements.AgentID = data.agentID;
    }

    if (data.dateFrom != null && data.dateFrom !== "") {
      query += `
        AND CONVERT(DATE, a.SalesDate) >= :DateFrom
      `;
      replacements.DateFrom = data.dateFrom;
    }
    if (data.dateTo != null && data.dateTo !== "") {
      query += `
        AND CONVERT(DATE, a.SalesDate) <= :DateTo
      `;
      replacements.DateTo = data.dateTo;
    }
    if (data.lotNo != null && data.lotNo !== "") {
      query += `
      AND a.LotNo = :LotNo
      `;
      replacements.LotNo = data.lotNo;
    }
    if (data.purchaserIDName != null && data.purchaserIDName !== "") {
      query += `
      AND (a.PurchaserName = :PurchaserIDName OR a.PurchaserID = :PurchaserIDName)
      `;
      replacements.PurchaserIDName = data.purchaserIDName;
    }

    if (data.salesID != null && data.salesID !== "") {
      query += `
      AND a.SalesId = :SalesID
      `;
      replacements.SalesID = data.salesID;
    }

    if (data.status != null && data.status !== "") {
      query += `
      AND a.InstallmentStatus = :Status
      `;
      replacements.Status = data.status;
    }

    if (data.category != null && data.category !== 0) {
      query += `
      AND a.Category = :Category
      `;
      replacements.Category = data.category;
    }

    const countQuery = `
      SELECT COUNT(*) AS Total
      ${query} 
    `;

    query = `
      SELECT 
        LotNo, SalesId, PurchaserID, PurchaserName, SalesDate, PurchasePrice, TotalPayment,
	      ExpectedCollection, TotalBalance, PaymentProgress, NextInstallmentDue, InstallmentStatus
      ${query}
    `;

    query += `
    ORDER BY a.SalesId DESC
    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
    `;

    const result = await sequelize.query(query, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    const totalCount = await sequelize.query(countQuery, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    return { data: result, totalRows: totalCount[0].Total };
  }

  static async getTransactionHistory(data) {
    const offset = (data.pageNumber - 1) * data.pageSize;
    const replacements = { offset: offset, pageSize: data.pageSize };

    let query = `
    FROM tbl_SalesPayment SP WITH (NOLOCK)
    LEFT JOIN tbl_Sales S WITH (NOLOCK)
    ON S.IsDeleted = 0 AND S.SalesId = SP.SalesId
    LEFT JOIN tbl_MemberInfo MI WITH (NOLOCK)
    ON MI.IsDeleted = 0 AND MI.MemberId = S.PurchaserID
    LEFT JOIN tbl_MemberInfo MI2 WITH (NOLOCK)
    ON MI2.IsDeleted = 0 AND MI2.MemberId = S.MemberID
    LEFT JOIN tbl_Parameter P1 WITH (NOLOCK)
    ON P1.Category = 'SalesStatus' AND SP.StatusX = P1.ParameterValue
    LEFT JOIN tbl_Parameter P2 WITH (NOLOCK)
    ON P2.Category = 'PaymentType' AND SP.PaymentType = P2.ParameterValue
    LEFT JOIN tbl_Parameter P3 WITH (NOLOCK)
    ON P3.Category = 'PaymentPurpose' AND SP.PaymentPurpose = P3.ParameterValue
    WHERE SP.IsDeleted = 0 
    `;

    if (data.agentID != null && data.agentID !== "") {
      query += `
        AND (MI2.AgentID = :AgentID OR MI2.MemberID = :AgentID)
      `;
      replacements.AgentID = data.agentID;
    }

    if (data.dateFrom != null && data.dateFrom !== "" && data.dateTo != null && data.dateTo !== "") {
      query += `
      AND (SP.TransactionDate BETWEEN :DateFrom AND :DateTo)
      `;
      replacements.DateFrom = data.dateFrom + " 00:00:00";
      replacements.DateTo = data.dateTo + " 23:59:59.997";
    }
    if (data.salesID != null && data.salesID !== "") {
      query += `
      AND SP.SalesID = :SalesID
      `;
      replacements.SalesID = data.salesID;
    }

    if (data.purchaserIDName != null && data.purchaserIDName !== "") {
      query += `
      AND (MI.MemberID = :PurchaserIDName OR MI.Fullname = :PurchaserIDName)
      `;
      replacements.PurchaserIDName = data.purchaserIDName;
    }

    if (data.lotNo != null && data.lotNo !== "") {
      query += `
      AND S.UnitID = :LotNo
      `;
      replacements.LotNo = data.lotNo;
    }

    if (data.status != null && data.status !== "") {
      query += `
      AND SP.StatusX = :Status
      `;
      replacements.Status = data.status;
    }

    if (data.paymentPurpose != null && data.paymentPurpose !== 0) {
      query += `
      AND SP.PaymentPurpose = :PaymentPurpose
      `;
      replacements.PaymentPurpose = data.paymentPurpose;
    }

    const countQuery = `
        SELECT COUNT(*) AS Total
        ${query} 
    `;

    query = `
      SELECT 
        ISNULL(S.UnitID, '-') AS 'UnitID', SP.SalesID, CONVERT(VARCHAR, SP.TransactionDate, 105) AS 'TransactionDate', SP.Amount, ISNULL(P1.ParameterName_EN, '-') AS 'StatusEN', ISNULL(P1.ParameterName_ZH, '-') AS 'StatusZH',
        MI.Fullname AS 'PurchaserName', ISNULL(P2.ParameterName_EN, '-') AS 'PaymentTypeEN', ISNULL(P2.ParameterName_ZH, '-') AS 'PaymentTypeZH',
        ISNULL(P3.ParameterName_EN, '-') AS 'PaymentPurposeEN', ISNULL(P3.ParameterName_ZH, '-') AS 'PaymentPurposeZH',
        ISNULL(SP.UpdatedBy, '-') AS 'UpdatedBy', ISNULL(S.RejectedReasons, '-') AS 'RejectedReasons', ISNULL(SP.Receipt, '-') AS 'Receipt',
        S.SalesType
      ${query}
    `;

    query += `
    ORDER BY SP.Id
    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
    `;

    const result = await sequelize.query(query, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    const totalCount = await sequelize.query(countQuery, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    return { data: result, totalRows: totalCount[0].Total };
  }

  static async getOrderList(data) {
    const offset = (data.pageNumber - 1) * data.pageSize;
    const replacements = { offset: offset, pageSize: data.pageSize };

    let query = `
    FROM (
      SELECT 
        ISNULL(UC.UnitID, P.ProductCode) AS 'UniqueCode', ISNULL(UC.CategoryID, P.ProductCategoryID) as 'CategoryID', miC.Fullname,
        ISNULL(UC.ReferencePrice,0) AS 'UnitReferencePrice', ISNULL(UC.ReferenceContinuityFee,0) AS 'UnitReferenceContinuityFee',
        ISNULL(ISNULL(U.UnitDiscount, F.UnitDiscount), 0) AS 'UnitDiscount', S.SalesID, ISNULL(mi.AgentID, mi.MemberID) AS 'AgentID', ISNULL(miu.Fullname,'-') AS 'UpdatedBy', 
        ISNULL(ISNULL(S.BindUnitSalesID, S.BindUnitBookingID), S.SalesID) AS 'PurchaseOrderRef', 
        CONVERT(NVARCHAR, S.SalesDate, 103) AS 'SalesDate', ISNULL(UC.UnitStatusX, '-') AS 'UnitStatusX',
        CASE WHEN UC.UnitStatusX = 'B' AND S.SalesType IN (6, 7) THEN ISNULL(CONVERT(NVARCHAR, S.SalesDate, 103), '-') ELSE NULL END AS 'ReservationDate',
        CASE WHEN UC.UnitStatusX = 'B' AND S.SalesType IN (6, 7) THEN ISNULL(CONVERT(NVARCHAR, S.BookingExpiry, 103), '-') ELSE NULL END AS 'ReservationExpiryDate',
        CASE WHEN R.RelateSalesID IS NULL THEN 0 ELSE 1 END AS 'TerminatedForRefund',
        ISNULL(UC.ReferencePrice,0) + ISNULL(UC.ReferenceContinuityFee,0) AS 'TotalRefPrice',
        CASE WHEN S.AuthorizedFullName IS NULL THEN 1 ELSE 0 END AS 'CanAssignAuthorized',
		    ISNULL(F.MaintenanceFee, ISNULL(U.MaintenanceFee, 0)) AS 'MaintenanceFee', ISNULL(F.TotalPrice, ISNULL(U.UnitPrice, 0)) AS 'UnitPrice', 
        ISNULL(S.IntroducerDetail, '-') AS 'IntroducerDetail', S.StatusX AS 'SalesStatus',
		    S.RejectedReasons, R.RefundDate, R.Amount AS 'RefundAmount', S.TotalPrice, 
        ISNULL(S.MailToPurchaserID, '-') AS 'MailToPurchaserID',
        mi.MemberID AS AgentMemberID, miC.MemberID AS PurchaserMemberID
      FROM tbl_Sales S WITH (NOLOCK)
      LEFT JOIN tbl_SalesPayment SP WITH (NOLOCK) ON SP.SalesId = S.SalesId AND SP.IsDeleted = 0
      LEFT JOIN tbl_SalesDetails SD WITH (NOLOCK) ON SD.SalesId = S.SalesId AND SD.IsDeleted = 0 
      LEFT JOIN tbl_UnitCollection UC WITH (NOLOCK) ON UC.UnitID = S.UnitID AND UC.IsDeleted = 0 
      LEFT JOIN tbl_Product P WITH (NOLOCK) ON P.IsDeleted = 0 AND P.ProductCode = SD.ProductCode -- FOR NON-LOT SALES
      LEFT JOIN tbl_MemberInfo mi WITH (NOLOCK) ON mi.MemberID = s.MemberID and mi.IsDeleted = 0
      LEFT JOIN tbl_MemberInfo miC WITH (NOLOCK) ON miC.MemberID = S.PurchaserID AND miC.IsDeleted = 0
      LEFT JOIN tbl_MemberInfo miu WITH (NOLOCK) ON  miu.MemberID = s.updatedby AND miu.IsDeleted = 0
      LEFT JOIN tbl_Refund R WITH (NOLOCK) ON R.RelateSalesID = S.SalesId AND R.IsDeleted = 0
      LEFT JOIN tbl_FSPPODetails F WITH (NOLOCK) ON F.SalesId = S.SalesId AND F.IsDeleted = 0
      LEFT JOIN tbl_UnitPODetails U WITH (NOLOCK) ON U.SalesId = S.SalesId AND U.IsDeleted = 0
      WHERE S.IsDeleted = 0 AND S.SalesDate BETWEEN :SalesDateFrom AND :SalesDateTo
    `;

    replacements.SalesDateFrom = data.salesDateFrom + " 00:00:00";
    replacements.SalesDateTo = data.salesDateTo + " 23:59:59.997";

    if (data.agentCode_Name_IC != null && data.agentCode_Name_IC !== "") {
      query += `
      AND (mi.MemberID LIKE :AgentCode_Name_IC OR mi.AgentID LIKE :AgentCode_Name_IC OR mi.Fullname LIKE :AgentCode_Name_IC OR mi.IC LIKE :AgentCode_Name_IC)
      `;
      replacements.AgentCode_Name_IC = `%${data.agentCode_Name_IC}%`;
    }

    if (data.purchaserID_Name != null && data.purchaserID_Name !== "") {
      query += `
      AND (miC.MemberID LIKE :PurchaserID OR miC.Fullname LIKE :PurchaserID)
      `;
      replacements.PurchaserID = `%${data.purchaserID_Name}%`;
    }

    if (data.salesType != null && data.salesType !== 0) {
      if (Array.isArray(data.salesType)) {
        query += ` AND S.SalesType IN (:SalesType)`;
      } else {
        query += ` AND S.SalesType = :SalesType`;
      }
      replacements.SalesType = data.salesType;
    }

    if (data.status.length > 0) {
      query += `
      AND S.StatusX IN (:StatusX)
      `;
      replacements.StatusX = data.status;
    }

    query += `
    ) AS a
    LEFT JOIN tbl_SalesPayment SP WITH (NOLOCK) ON SP.SalesId = a.SalesId AND SP.PaymentPurpose IN ('1','8') AND SP.StatusX = 'A' AND SP.IsDeleted = 0
    LEFT JOIN tbl_Product_Category PCA WITH (NOLOCK) ON PCA.ID = a.CategoryID AND PCA.IsDeleted = 0
    WHERE a.UniqueCode IS NOT NULL 
    `;

    if (
      (data.bookingDateFrom != null && data.bookingDateFrom !== "") ||
      (data.bookingDateTo != null && data.bookingDateTo !== "")
    ) {
      query += `
      AND ISDATE(a.ReservationDate) = 1
      `;
    }

    if (data.bookingDateFrom != null && data.bookingDateFrom !== "") {
      query += `
      AND CONVERT(DATE, a.ReservationDate, 103) >= :BookingDateFrom
      `;
      replacements.BookingDateFrom = data.bookingDateFrom + " 00:00:00";
    }

    if (data.bookingDateTo != null && data.bookingDateTo !== "") {
      query += `
      AND CONVERT(DATE, a.ReservationDate, 103) <= :BookingDateTo
      `;
      replacements.BookingDateTo = data.bookingDateTo + " 23:59:59.997";
    }

    if (data.uniqueCode != null && data.uniqueCode !== "") {
      query += `
      AND a.UniqueCode = :uniqueCode
      `;
      replacements.uniqueCode = data.uniqueCode;
    }

    if (data.categoryID != null && data.categoryID !== 0) {
      query += `
      AND a.CategoryID = :CategoryID
      `;
      replacements.CategoryID = data.categoryID;
    }

    if (data.isTerminatedForRefund != null && data.isTerminatedForRefund !== 0) {
      query += `
      AND a.TerminatedForRefund = :TerminatedForRefund
      `;
      replacements.TerminatedForRefund = data.isTerminatedForRefund;
    }

    if (data.salesId != null && data.salesId !== 0) {
      query += `
      AND a.SalesID = :SalesID
      `;
      replacements.SalesID = data.salesId;
    }

    query = `
      SELECT
        a.UniqueCode, a.CategoryID, a.Fullname, ISNULL(sp.Remarks,'-') AS 'Remarks', ISNULL(PCA.CategoryName, '-') AS 'CategoryName', 
        a.UnitReferencePrice, a.UnitReferenceContinuityFee, a.UnitDiscount, a.SalesID, a.AgentID, a.UpdatedBy, 
        a.PurchaseOrderRef, a.SalesDate, a.UnitStatusX, a.ReservationDate, a.ReservationExpiryDate,
        SUM(ISNULL(sp.Amount, 0)) AS 'TotalPayment', a.TotalPrice, a.UnitPrice, a.TerminatedForRefund, a.TotalRefPrice, a.CanAssignAuthorized,
        a.MaintenanceFee, a.IntroducerDetail, a.SalesStatus, a.RejectedReasons, a.RefundDate, a.RefundAmount, a.MailToPurchaserID,
        a.AgentMemberID, a.PurchaserMemberID,
        JSON_QUERY(COALESCE((
          SELECT IU.FullName, IU.ChineseName, IU.IC, IU.Relationship, IU.Gender, IU.AssignAt, IU.CheckInAt, IU.ID, IU.DeathCertificateUrl
          FROM tbl_Unit_IntendedUser IU WITH (NOLOCK) 
          WHERE IU.UnitID = a.UniqueCode AND IU.IsDeleted = 0 AND IU.StatusX = 1
          FOR JSON PATH
        ), '[]')) AS IntendedUsers
      ${query}
      GROUP BY a.SalesID, a.UniqueCode, a.CategoryID, ISNULL(PCA.CategoryName ,'-'),  
        a.UnitReferencePrice, a.PurchaseOrderRef, a.UnitReferenceContinuityFee, a.UnitDiscount, 
        a.AgentID, a.SalesDate, a.TerminatedForRefund, a.UpdatedBy, a.Fullname, a.CanAssignAuthorized, 
        sp.Remarks, a.UnitStatusX, a.ReservationDate, a.ReservationExpiryDate, a.TotalRefPrice, a.MaintenanceFee, a.IntroducerDetail, a.SalesStatus,
        a.RejectedReasons, a.RefundDate, a.RefundAmount, a.TotalPrice, a.UnitPrice, a.MailToPurchaserID, a.AgentMemberID, a.PurchaserMemberID
    `;

    const countQuery = `
      WITH MainQuery AS (
        ${query} 
      )
      SELECT 
        COUNT(*) AS Total
        FROM MainQuery;
    `;

    query += `
    ORDER BY a.SalesID 
    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
    `;

    const result = await sequelize.query(query, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });

    const totalCount = await sequelize.query(countQuery, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    return {
      data: result.map((row) => ({ ...row, IntendedUsers: JSON.parse(row.IntendedUsers) })),
      totalRows: totalCount[0].Total,
    };
  }

  static async generateSalesID() {
    const query = `
      DECLARE @PreviousSalesID nvarchar(50) = (select top 1 tempSalesId from tbl_Sales order by Id desc);
      DECLARE @SALESID NVARCHAR(50);
      EXEC [pCreateOrderID] @Pre = @PreviousSalesID, @CountryCode='127', @NewOrderID = @SALESID output;
    `;
    const result = await sequelize.query(query, {
      replacements: {},
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0].SalesID;
  }
  static async generateTransactionID() {
    const query = `
      DECLARE @NEWTRANID NVARCHAR(50); 
      EXEC [dbo].[DEMO_GenerateTransactionID] @NEWTRANID OUTPUT;
    `;
    const result = await sequelize.query(query, {
      replacements: {},
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0].TranID;
  }
  static async generateRefundID() {
    const query = `
      DECLARE @NEWTRANID NVARCHAR(50); 
      EXEC [dbo].[DEMO_GenerateRefundID] @NEWTRANID OUTPUT;
    `;
    const result = await sequelize.query(query, {
      replacements: {},
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0].TranID;
  }
  static async updateSalesActiveBookingID(data, req, t = null) {
    const query = `
    UPDATE [dbo].tbl_UnitCollection SET ActiveBookingID = :ActiveBookingID, UnitStatusX = 'B', DisplayStatusX = 'B' WHERE UnitID = :UnitID;
  `;
    await sequelize.query(query, {
      replacements: {
        ActiveBookingID: data.bookingID,
        UnitID: data.unitID,
      },
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "UPDATE LOT STATUS TO BOOKED", sql, t);
      },
    });
  }
  static async updateSalesActiveSalesID(data, req, t = null) {
    const query = `
    UPDATE [dbo].tbl_UnitCollection SET ActiveSalesID = :ActiveSalesID, OwnerID = :PurchaseID, UnitStatusX = 'S', DisplayStatusX = 'S' WHERE UnitID = :UnitID;
  `;
    await sequelize.query(query, {
      replacements: {
        ActiveSalesID: data.salesID,
        UnitID: data.unitID,
        PurchaseID: data.purchaserID,
      },
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "UPDATE LOT STATUS TO SOLD", sql, t);
      },
    });
  }

  static async cancelBookingSales(data, req, t = null) {
    const query = `
	    UPDATE [dbo].tbl_Sales SET StatusX = :status, UpdatedBy = :UpdatedBy, UpdatedAt = GETDATE() WHERE SalesId = :salesID; 
    `;
    await sequelize.query(query, {
      replacements: {
        salesID: data.salesID,
        status: data.status,
        UpdatedBy: data.createdBy,
      },
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "UPDATE BOOKING SALES TO CANCELLED", sql, t);
      },
    });
  }

  static async updateBookingSalesStatus(data, req, t = null) {
    const query = `
	    UPDATE [dbo].tbl_Sales SET StatusX = :status WHERE SalesId = :salesID;
	    UPDATE [dbo].tbl_SalesPayment SET StatusX = :status WHERE SalesId = :salesID;  
    `;
    await sequelize.query(query, {
      replacements: {
        salesID: data.salesID,
        status: data.status,
      },
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "UPDATE BOOKING SALES TO REFUNDED", sql, t);
      },
    });
  }

  static async updateUnitCollectionStatus(data, req, t = null) {
    const query = `
      UPDATE [dbo].tbl_UnitCollection SET ActiveBookingID = :bookingID, ActiveSalesID = :activeSalesID, UnitStatusX = :status, DisplayStatusX = :status WHERE UnitID = (SELECT TOP 1 UnitID FROM tbl_Sales WITH (NOLOCK) WHERE SalesID = :salesID);
    `;
    await sequelize.query(query, {
      replacements: {
        salesID: data.salesID,
        status: data.status,
        bookingID: data.bookingID || null,
        activeSalesID: data.activeSalesID || null,
      },
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "UPDATE UNIT COLLECTION STATUS", sql, t);
      },
    });
  }

  static async getLotBookingDetails(salesID) {
    const query = `
    SELECT
      s.SalesId, sp.TransactionID, s.UnitID AS 'LotNo', s.MemberId AS 'AgentID', ISNULL(ISNULL(m.Fullname, m.DisplayName), '-') AS 'AgentName',
      CONVERT(VARCHAR, s.SalesDate, 120) AS 'SalesDate', ISNULL(CONVERT(VARCHAR, s.ApprovalDate, 120), '-') AS 'ApprovalDate',
      s.PurchaserID, ISNULL(ISNULL(m1.Fullname, m1.DisplayName), '-') AS 'PurchaserName',
      sp.Amount AS 'Price', ISNULL(c.ReferencePrice, 0) AS 'BookingFee',
      CASE WHEN c.UnitStatusX = 'B' AND s.SalesType IN (6, 7) THEN ISNULL(CONVERT(NVARCHAR, s.SalesDate, 103), '-') ELSE NULL END AS 'ReservationDate',
      CASE WHEN c.UnitStatusX = 'B' AND s.SalesType IN (6, 7) THEN ISNULL(CONVERT(NVARCHAR, s.BookingExpiry, 103), '-') ELSE NULL END AS 'ReservationExpiryDate',
      c.ZoneX, c.RowX, c.AreaSize,
      m1.IC, m1.MobileCode + m1.Mobile AS 'MobileNumber',
      (m1.ResidentialAddress + 
			CASE WHEN m1.ResidentialAddress2 IS NULL THEN '' ELSE ', ' + m1.ResidentialAddress2 END + 
			CASE WHEN m1.ResidentialAddress3 IS NULL THEN '' ELSE ', ' + m1.ResidentialAddress3 END +
			CASE WHEN m1.ResidentialCity IS NULL THEN '' ELSE ', ' + m1.ResidentialCity END +
			CASE WHEN m1.ResidentialState IS NULL THEN '' ELSE ', ' + s1.State_Name END +
			CASE WHEN m1.ResidentialPostCode IS NULL THEN '' ELSE ', ' + m1.ResidentialPostCode END +
			CASE WHEN m1.ResidentialCountry IS NULL THEN '' ELSE ', ' + c1.Country_Name END) AS 'ResidentialAddress',
      ISNULL(c.ReferencePrice,0) + ISNULL(c.ReferenceContinuityFee,0) AS 'TotalRefPrice'
    FROM tbl_Sales s WITH (NOLOCK)
    INNER JOIN tbl_SalesPayment sp WITH (NOLOCK) ON sp.SalesId = s.SalesId AND sp.StatusX = 'A'
    INNER JOIN tbl_MemberInfo m WITH (NOLOCK) ON m.MemberId = s.MemberId AND m.IsDeleted = 0
    INNER JOIN tbl_MemberInfo m1 WITH (NOLOCK) ON m1.MemberId = s.PurchaserID AND m1.IsDeleted = 0
    LEFT JOIN tbl_Country c1 WITH (NOLOCK) ON c1.IsDeleted = 0 AND c1.ID = m1.ResidentialCountry
		LEFT JOIN tbl_State s1 WITH (NOLOCK) ON s1.IsDeleted = 0 AND s1.ID = m1.ResidentialState
    LEFT JOIN tbl_UnitCollection c WITH (NOLOCK) ON c.IsDeleted = 0 AND c.UnitID = s.UnitID
    WHERE s.SalesType = 6 AND s.IsDeleted = 0 AND s.SalesId = :SalesID
    `;

    const result = await sequelize.query(query, {
      replacements: { SalesID: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  static async getSalesInstallmentDetails(salesID) {
    const query = `
    WITH InstallmentData AS (
        SELECT 
            InstallmentNo,
            Amount,
            CONVERT(VARCHAR, DueDate, 120) AS 'InstallmentDueDate',
            IsPaid
        FROM tbl_SalesInstallment WITH (NOLOCK)
        WHERE SalesID = :SalesId AND IsDeleted = 0
    )
    SELECT
    (SELECT COUNT(InstallmentNo) FROM InstallmentData) AS 'TotalInstallments',
    (SELECT Amount FROM InstallmentData WHERE InstallmentNo = 1) AS 'FirstInstallment',
    (SELECT TOP 1 Amount FROM InstallmentData WHERE InstallmentNo <> 1) AS 'SumPerInstallment',
    (SELECT SUM(Amount) FROM InstallmentData) AS 'TotalAmount',
    CASE WHEN EXISTS (SELECT 1 FROM InstallmentData WHERE IsPaid = 0) THEN 0 ELSE 1 END AS 'IsSold',
    CONCAT(
        (SELECT MIN(InstallmentDueDate) FROM InstallmentData),
        ' ~ ',
        (SELECT MAX(InstallmentDueDate) FROM InstallmentData)
    ) AS 'InstallmentDateRange'
    `;

    const result = await sequelize.query(query, {
      replacements: { SalesId: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  static async getLotPurchaseDetails(salesID) {
    const query = `
    SELECT
      s.SalesId, s.UnitID AS 'LotNo', s.MemberId AS 'AgentID', ISNULL(ISNULL(m.Fullname, m.DisplayName), '-') AS 'AgentName',
      s.PurchaserID, ISNULL(ISNULL(m1.Fullname, m1.DisplayName), '-') AS 'PurchaserName',
      p.UnitPrice, p.MaintenanceFee, (p.UnitPrice + p.MaintenanceFee) AS 'TotalAmount', 
      p.UnitDiscount, (p.UnitPrice + p.MaintenanceFee - p.UnitDiscount) AS 'BalancePayable', 
      p.Downpayment, (p.UnitPrice + p.MaintenanceFee - p.UnitDiscount - p.Downpayment) AS 'BalanceAmount', 
      p.BookingReceived, spt.TotalPaid AS 'AmountPaid', CONVERT(VARCHAR, s.SalesDate, 120) AS 'SalesDate'
    FROM tbl_Sales s WITH (NOLOCK)
    INNER JOIN tbl_MemberInfo m WITH (NOLOCK) ON m.MemberId = s.MemberId AND m.IsDeleted = 0
    INNER JOIN tbl_MemberInfo m1 WITH (NOLOCK) ON m1.MemberId = s.PurchaserID AND m1.IsDeleted = 0
    LEFT JOIN tbl_UnitPODetails p WITH (NOLOCK) ON p.IsDeleted = 0 AND p.SalesId = s.SalesId
    OUTER APPLY (
      SELECT SUM(Amount) AS 'TotalPaid'
      FROM tbl_SalesPayment sp WITH (NOLOCK)
      WHERE sp.IsDeleted = 0 AND sp.SalesId = :SalesId AND sp.StatusX = 'A'
    ) spt
    WHERE s.IsDeleted = 0 AND s.SalesId = :SalesId
    `;

    const result = await sequelize.query(query, {
      replacements: { SalesId: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  static async getFSPDetails(salesID) {
    const query = `
    SELECT
      s.SalesId, sp.TransactionID, s.UnitID AS 'LotNo', sd.ProductCode, sd.ProductName,
      s.MemberId AS 'AgentID', ISNULL(ISNULL(m.Fullname, m.DisplayName), '-') AS 'AgentName',
      s.PurchaserID, ISNULL(ISNULL(m1.Fullname, m1.DisplayName), '-') AS 'PurchaserName',
      f.TotalPrice AS 'UnitPrice', f.MaintenanceFee, s.TotalPrice, (f.TotalPrice + f.MaintenanceFee) AS 'TotalAmount', 
      f.UnitDiscount, (f.TotalPrice + f.MaintenanceFee - f.UnitDiscount) AS 'BalancePayable', 
      f.Downpayment, (f.TotalPrice + f.MaintenanceFee - f.UnitDiscount - f.Downpayment) AS 'BalanceAmount',
      CONVERT(VARCHAR, s.SalesDate, 120) AS 'SalesDate'
    FROM tbl_Sales s WITH (NOLOCK)
    INNER JOIN tbl_SalesPayment sp WITH (NOLOCK) ON sp.IsDeleted = 0 AND sp.SalesId = s.SalesId AND sp.StatusX = 'A'
    INNER JOIN tbl_MemberInfo m WITH (NOLOCK) ON m.MemberId = s.MemberId AND m.IsDeleted = 0
    INNER JOIN tbl_MemberInfo m1 WITH (NOLOCK) ON m1.MemberId = s.PurchaserID AND m1.IsDeleted = 0
    LEFT JOIN tbl_UnitCollection c WITH (NOLOCK) ON c.IsDeleted = 0 AND c.UnitID = s.UnitID
    LEFT JOIN tbl_FSPPODetails f WITH (NOLOCK) ON f.IsDeleted = 0 AND f.SalesId = s.SalesId
    LEFT JOIN tbl_SalesDetails sd WITH (NOLOCK) ON sd.IsDeleted = 0 AND sd.SalesId = s.SalesId
    WHERE s.SalesType = 3 AND s.IsDeleted = 0 AND s.SalesId = :SalesId
    `;

    const result = await sequelize.query(query, {
      replacements: { SalesId: salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  static async addAuthorizedRepresentativeToSales(data, req, t = null) {
    const query = `
    UPDATE tbl_Sales
    SET AuthorizedFullName = :AuthorizedFullName, 
        AuthorizedIC = :AuthorizedIC, 
        AuthorizedMobileNo = :AuthorizedMobileNo,
        UpdatedBy = :CreatedBy,
        UpdatedAt = GETDATE()
    WHERE IsDeleted = 0 AND SalesId = :SalesId
    `;

    await sequelize.query(query, {
      replacements: {
        SalesId: data.salesID,
        AuthorizedFullName: data.authorizedFullName,
        AuthorizedIC: data.authorizedIC,
        AuthorizedMobileNo: data.authorizedMobileNo,
        CreatedBy: data.memberID,
      },
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "ADD REPRESENTATIVE", sql, t);
      },
    });
  }
  static async approveRejectSales(data, req, t = null) {
    const sales = await this.getSalesBySalesID(data.salesID);
    let updateStatus = data.isApproved ? "APPROVE" : "REJECT";
    let replacement = {
      MemberID: data.memberID,
      SalesID: data.salesID,
    };
    let query;
    if (data.isApproved) {
      query = `
        UPDATE tbl_Sales SET StatusX = 'A', ApprovalDate = GETDATE(), ApprovedBy = :MemberID, UpdatedBy = :MemberID, UpdatedAt = GETDATE() WHERE SalesID = :SalesID;
        UPDATE tbl_SalesPayment SET StatusX = 'A', UpdatedBy = :MemberID, UpdatedAt = GETDATE() WHERE SalesID = :SalesID AND IsDeleted = 0 AND PaymentPurpose <> 2;
      `;
      if (data.isFirstSales) {
        query += `
          UPDATE tbl_memberinfo SET AgentID = :AgentID, UpdatedBy = :MemberID, UpdatedAt = GETDATE() WHERE MemberID = :SalesMemberID;
        `;
        replacement.SalesMemberID = sales[0].MemberId;
        replacement.AgentID = data.agentID;
      }
      if (sales[0].SalesType === "1") {
        query += `
          UPDATE tbl_memberinfo SET StatusX = 'A', UpdatedBy = :MemberID, UpdatedAt = GETDATE() WHERE MemberID = :SalesMemberID;
        `;
        replacement.SalesMemberID = sales[0].MemberId;
      }
    } else {
      query = `
        UPDATE tbl_Sales SET StatusX = 'R', RejectedDate = GETDATE(), RejectedBy = :MemberID, RejectedReasons = :RejectedReason, UpdatedBy = :MemberID, UpdatedAt = GETDATE() WHERE SalesID = :SalesID;
        UPDATE tbl_SalesPayment SET StatusX = 'R', UpdatedBy = :MemberID, UpdatedAt = GETDATE() WHERE SalesID = :SalesID;
      `;
      if (sales[0].SalesType === "1") {
        query += `
          UPDATE tbl_memberinfo SET StatusX = 'R', UpdatedBy = :MemberID, UpdatedAt = GETDATE() WHERE MemberID = :SalesMemberID;
        `;
        replacement.SalesMemberID = sales[0].MemberId;
      }
      replacement.RejectedReason = data.rejectedReason;
    }
    console.log("Replacement:", replacement);
    console.log("Query:", query);
    await sequelize.query(query, {
      replacements: replacement,
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, `${updateStatus} SALES`, sql, t);
      },
    });
  }
  static async approveRejectInstallmentPayments(data, req, t = null) {
    let updateStatus = data.isApproved ? "APPROVE" : "REJECT";
    const query = `
    UPDATE tbl_SalesPayment 
      SET StatusX = :Status, UpdatedAt = GETDATE(), UpdatedBy = :UpdatedBy
    WHERE IsDeleted = 0 AND TransactionID = :TransactionID AND StatusX = 'P';
    `;

    await sequelize.query(query, {
      replacements: {
        Status: data.isApproved ? "A" : "R",
        TransactionID: data.transactionID,
        UpdatedBy: data.createdBy,
      },
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, `${updateStatus} INSTALLMENT PAYMENT`, sql, t);
      },
    });
  }
  static async insertTblRefund(data, req, t = null) {
    const member = await MemberService.findMemberByMemberID(data.memberID, t);
    data.refundID = data.refundID == null ? await this.generateRefundID() : data.refundID;
    const query = `
      INSERT INTO [dbo].[tbl_Refund] 
      ([RefundID], [RelateSalesID], [RefundDate], [Amount], [Remarks], [CreatedBy], [CreatedAt], [IsDeleted])
      VALUES 
      (:RefundID, :RelateSalesID, :RefundDate, :Amount, :Remarks, :CreatedBy, GETDATE(), 0);
    `;
    let date = moment().tz("Asia/Kuala_Lumpur").toDate();
    date = format(date, "yyyy-MM-dd HH:mm:ss.SSS");
    await sequelize.query(query, {
      replacements: {
        RefundID: data.refundID,
        RelateSalesID: data.salesID,
        RefundDate: data.refundDate || date,
        Amount: data.amount,
        Remarks: data.remarks || null,
        CreatedBy: data.memberID,
      },
      type: Sequelize.QueryTypes.INSERT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "INSERT REFUND", sql, t);
      },
    });
  }

  static async insertTblSales(data, req, t = null) {
    const query = `
    INSERT INTO [dbo].[tbl_Sales] (
      [SalesId], [tempSalesId], [MemberId], [UnitID], [PurchaserID], 
      [SalesByID], [TotalPV], [TotalPrice], [SalesType], [PaymentType], 
      [Remarks], [StatusX], [SalesDate], [IsOverdue], 
      [UnitPayable], [BindUnitSalesID], [IntroducerDetail], [AuthorizedFullName], 
      [AuthorizedIC], [AuthorizedMobileNo], [BookingExpiry], [CreatedBy], 
      [BindUnitBookingID], [MailToPurchaserID]
    ) VALUES (
      :SalesId, :TempSalesId, :MemberId, :UnitID, :PurchaserID, 
      :SalesByID, :TotalPV, :TotalPrice, :SalesType, :PaymentType, 
      :Remarks, :StatusX, GETDATE(), :IsOverdue, 
      :UnitPayable, :BindUnitSalesID, :IntroducerDetail, :AuthorizedFullName, 
      :AuthorizedIC, :AuthorizedMobileNo, :BookingExpiry, :CreatedBy, 
      :BindUnitBookingID, :MailToPurchaserID
    );
  `;
    await sequelize.query(query, {
      replacements: {
        SalesId: data.salesID,
        TempSalesId: data.salesID,
        MemberId: data.memberID,
        UnitID: data.unitID || null,
        PurchaserID: data.purchaserID,
        SalesByID: data.salesByID,
        TotalPV: data.totalPV,
        TotalPrice: data.totalPrice,
        SalesType: data.salesType,
        PaymentType: data.paymentType,
        Remarks: data.remarks || null,
        StatusX: data.status,
        IsOverdue: "0",
        UnitPayable: data.unitPayable,
        BindUnitSalesID: data.bindUnitSalesID || null,
        IntroducerDetail: data.introducerDetail || null,
        AuthorizedFullName: data.authorizedFullName || null,
        AuthorizedIC: data.authorizedIC || null,
        AuthorizedMobileNo: data.authorizedMobileNo || null,
        BookingExpiry: data.bookingExpiry || null,
        CreatedBy: data.memberID,
        BindUnitBookingID: data.bindUnitBookingID || null,
        MailToPurchaserID: data.mailToPurchaserId || null,
      },
      type: Sequelize.QueryTypes.INSERT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "INSERT SALES", sql, t);
      },
    });
  }

  static async insertTblSalesPayment(data, req, t = null) {
    const member = await MemberService.findMemberByMemberID(data.memberID, t);
    data.transactionID = data.transactionID == null ? await this.generateTransactionID() : data.transactionID;
    const query = `
    INSERT INTO [dbo].[tbl_SalesPayment] (
      [SalesId], [tempSalesId], [TransactionID], [TransactionDate], [PaymentType],
      [Amount], [PaymentPurpose], [StatusX], [FullName], [ContactNo], [Remarks], [CreatedBy], [Receipt]
    ) VALUES (
      :SalesId, :TempSalesId, :TransactionID, GETDATE(), :PaymentType,
      :Amount, :PaymentPurpose, :StatusX, :FullName, :ContactNo, :Remarks, :CreatedBy, :Receipt
    );
  `;
    await sequelize.query(query, {
      replacements: {
        SalesId: data.salesID,
        TempSalesId: data.salesID,
        TransactionID: data.transactionID,
        PaymentType: data.paymentType,
        Amount: data.totalPrice,
        PaymentPurpose: data.paymentPurpose || null,
        StatusX: data.status,
        FullName: data.fullname || member.Fullname,
        ContactNo: data.contactNo || member.Mobile,
        Remarks: data.remarks || null,
        CreatedBy: data.memberID,
        Receipt: data.receipt || null,
      },
      type: Sequelize.QueryTypes.INSERT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "INSERT SALES PAYMENT", sql, t);
      },
    });
  }

  static async insertTblSalesDetails(data, req, t = null) {
    for (let i = 0; i < data.items.length; i++) {
      const query = `
      INSERT INTO [dbo].[tbl_SalesDetails] (
        [SalesId], [tempSalesId], [ProductID], [ProductCode], [ProductName], [SinglePrice],
        [SinglePV], [Quantity], [TotalPrice], [TotalPV], [CreatedBy]
      ) VALUES (
        :SalesId, :TempSalesId, :ProductID, :ProductCode, :ProductName, :SinglePrice,
        :SinglePV, :Quantity, :TotalPrice, :TotalPV, :CreatedBy
      );
    `;
      await sequelize.query(query, {
        replacements: {
          SalesId: data.salesID,
          TempSalesId: data.salesID,
          ProductID: data.items[i].productID,
          ProductCode: data.items[i].productCode,
          ProductName: data.items[i].productName,
          SinglePrice: data.items[i].singlePrice,
          SinglePV: data.items[i].singlePV,
          Quantity: data.items[i].quantity,
          TotalPrice: data.items[i].totalPrice,
          TotalPV: data.items[i].totalPV,
          CreatedBy: data.memberID,
        },
        type: Sequelize.QueryTypes.INSERT,
        transaction: t,
        logging: (sql, timing) => {
          Log.LogAction(req, "INSERT SALES DETAILS", sql, t);
        },
      });
    }
  }
  // Requires Specific Body, can refer from insertTblUnitPODetails
  static async insertTblSalesInstallment(data, req, t = null) {
    // const lot = data.lot;
    const query = `
    INSERT INTO [dbo].[tbl_SalesInstallment] (
      [SalesID], [InstallmentNo], [Amount], [DueDate],
      [IsPaid], [Remarks], [CreatedBy]
    ) VALUES (
      :SalesID, :InstallmentNo, :Amount, :DueDate, 
      :IsPaid, :Remarks, :CreatedBy
    );
    `;
    await sequelize.query(query, {
      replacements: {
        SalesID: data.salesID,
        InstallmentNo: data.installmentNo,
        Amount: data.amount,
        DueDate: String(data.dueDate),
        IsPaid: "0",
        Remarks: data.remarks || null,
        CreatedBy: data.memberID,
      },
      type: Sequelize.QueryTypes.INSERT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "INSERT SALES INSTALLMENT", sql, t);
      },
    });
  }

  static async insertTblFSPPODetails(data, req, t = null) {
    if (data.items != null && data.items.length > 0) {
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        if (item.isService) {
          const query = `
          INSERT INTO [dbo].[tbl_FSPPODetails] (
            [SalesId], [tempSalesId], [UnitID], [ProductCode], [ProductID], [TotalPrice],[MaintenanceFee],
            [UnitDiscount], [Downpayment], [BookingReceived], [CreatedBy]
          ) VALUES (
            :SalesId, :TempSalesId, :UnitID, :ProductCode, :ProductID, :TotalPrice, :MaintenanceFee,
            :UnitDiscount, :Downpayment, :BookingReceived, :CreatedBy
          );
        `;
          await sequelize.query(query, {
            replacements: {
              SalesId: data.salesID,
              TempSalesId: data.salesID,
              UnitID: data.unitID || null,
              ProductCode: item.productCode,
              ProductID: item.productID,
              TotalPrice: item.totalPrice,
              MaintenanceFee: item.paymentDetails.maintenanceFee,
              UnitDiscount: item.paymentDetails.unitDiscount,
              Downpayment: item.paymentDetails.downpayment,
              BookingReceived: item.paymentDetails.bookingReceived,
              CreatedBy: data.memberID,
            },
            type: Sequelize.QueryTypes.INSERT,
            transaction: t,
            logging: (sql, timing) => {
              Log.LogAction(req, "INSERT FSP PO DETAILS", sql, t);
            },
          });

          const paymentDetails = item.paymentDetails;
          const isFullyPaid =
            paymentDetails.unitPrice +
              paymentDetails.maintenanceFee -
              paymentDetails.unitDiscount -
              paymentDetails.downpayment <=
            0;
          const malaysiaTimezone = Constants.timeZone;
          if (isFullyPaid) {
            let dueDate = moment().tz("Asia/Kuala_Lumpur").toDate();
            dueDate = format(dueDate, "yyyy-MM-dd HH:mm:ss.SSS");
            let body = {
              salesID: data.salesID,
              installmentNo: 0,
              amount: paymentDetails.downpayment,
              dueDate: dueDate,
              remarks: data.remarks,
              memberID: data.memberID,
            };
            await this.insertTblSalesInstallment(body, req, t);
          } else {
            const balancePayable =
              paymentDetails.unitPrice +
              paymentDetails.maintenanceFee -
              paymentDetails.unitDiscount -
              paymentDetails.downpayment -
              paymentDetails.loanDetails.firstInstallment;
            const equalInstallment = paymentDetails.loanDetails.sumPerInstallment;
            const lastInstallment =
              balancePayable - (paymentDetails.loanDetails.installmentMonth - 2) * equalInstallment;

            for (let i = 1; i <= paymentDetails.loanDetails.installmentMonth; i++) {
              let dueDate = moment().tz("Asia/Kuala_Lumpur").toDate();
              dueDate = addMonths(dueDate, i);
              dueDate = format(dueDate, "yyyy-MM-dd HH:mm:ss.SSS");
              let amount = equalInstallment;
              if (i === paymentDetails.loanDetails.installmentMonth) {
                amount = lastInstallment;
              } else if (i === 1) {
                amount = paymentDetails.loanDetails.firstInstallment;
              }

              let body = {
                salesID: data.salesID,
                installmentNo: i,
                amount: amount,
                dueDate: dueDate,
                remarks: data.remarks,
                memberID: data.memberID,
              };
              await this.insertTblSalesInstallment(body, req, t);
            }
          }
        }
      }
    }
  }

  static async insertTblUnitPODetails(data, req, t = null) {
    const lot = data.lot;
    const query = `
      INSERT INTO [dbo].[tbl_UnitPODetails] (
        [SalesId], [tempSalesId], [UnitID], [UnitPrice],[MaintenanceFee],
        [UnitDiscount], [Downpayment], [BookingReceived], [CreatedBy]
      ) VALUES (
        :SalesId, :TempSalesId, :UnitID, :UnitPrice, :MaintenanceFee,
        :UnitDiscount, :Downpayment, :BookingReceived, :CreatedBy
      );
    `;
    await sequelize.query(query, {
      replacements: {
        SalesId: data.salesID,
        TempSalesId: data.salesID,
        UnitID: lot.unitID,
        UnitPrice: lot.unitPrice,
        MaintenanceFee: lot.maintenanceFee,
        UnitDiscount: lot.unitDiscount,
        Downpayment: lot.downpayment,
        BookingReceived: lot.bookingReceived,
        CreatedBy: data.memberID,
      },
      type: Sequelize.QueryTypes.INSERT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "INSERT UNIT PO DETAILS", sql, t);
      },
    });

    const loanDetails = lot.loanDetails;
    const isFullyPaid = lot.unitPrice + lot.maintenanceFee - lot.unitDiscount - lot.downpayment <= 0;
    const malaysiaTimezone = Constants.timeZone;
    if (isFullyPaid) {
      let dueDate = moment().tz("Asia/Kuala_Lumpur").toDate();
      dueDate = format(dueDate, "yyyy-MM-dd HH:mm:ss.SSS");

      let body = {
        salesID: data.salesID,
        installmentNo: 0,
        amount: lot.downpayment,
        dueDate: dueDate,
        remarks: data.remarks,
        memberID: data.memberID,
      };
      await this.insertTblSalesInstallment(body, req, t);
    } else {
      const balancePayable =
        lot.unitPrice + lot.maintenanceFee - lot.unitDiscount - lot.downpayment - loanDetails.firstInstallment;
      const equalInstallment = loanDetails.sumPerInstallment;
      const lastInstallment = balancePayable - (loanDetails.installmentMonth - 2) * equalInstallment;

      for (let i = 1; i <= loanDetails.installmentMonth; i++) {
        let dueDate = moment().tz("Asia/Kuala_Lumpur").toDate();
        dueDate = addMonths(dueDate, i);
        dueDate = format(dueDate, "yyyy-MM-dd HH:mm:ss.SSS");
        let amount = equalInstallment;
        if (i === loanDetails.installmentMonth) {
          amount = lastInstallment;
        } else if (i === 1) {
          amount = loanDetails.firstInstallment;
        }

        let body = {
          salesID: data.salesID,
          installmentNo: i,
          amount: amount,
          dueDate: dueDate,
          remarks: data.remarks,
          memberID: data.memberID,
        };
        await this.insertTblSalesInstallment(body, req, t);
      }
    }
  }

  static async insertSales(data, req, t = null) {
    // data.transactionID = await this.generateTransactionID();

    // if (data.receipt != null && data.receipt !== "") {
    //   const uploadRes = await OSS.UploadReceipt(data, req);
    //   if (Object.keys(uploadRes).length > 0) {
    //     data.receipt = uploadRes.receipt;
    //   } else {
    //     throw new Error("Upload failed for Receipt");
    //   }
    // }
    if (data?.ShippingState == null) {
      throw new Error(`Shipping State Cannot Be Null`);
    }
    // Check Wallet Balance
    if (data?.PaymentType == "1") {
      const balance = await QueryHandler.executeQuery('CW01', data);
      data.Price = 0;
      data.PV = 0;
      data.cart = await Promise.all(
        data?.cart.map(async (item) => {
          item.ShippingState = data.ShippingState;
          const itemDetails = (await QueryHandler.executeQuery('PD01', item))[0];
          item.CreatedBy = data.CreatedBy;
          item.SinglePV = itemDetails.PV;
          item.SinglePrice = itemDetails.Price;
          item.SingleWeight = itemDetails.Weight;
          data.Price += item.SinglePrice * item?.Quantity;
          data.PV += item.SinglePV * item?.Quantity;
          return item;
        })
      );

      if (data.Price > balance) {
        throw new Error(`Wallet Balance is Insufficient`);
      }
    }

    const isUsingExistingTransaction = t != null;

    const transaction = t == null ? await sequelize.transaction() : t;
    const tempSalesID = await QueryHandler.executeQuery('SL01', data, req, transaction);
    data.TempSalesID = tempSalesID[0].SalesID;
    data.cart = await Promise.all(
      data?.cart.map(async (item) => {
        item.TempSalesID = data.TempSalesID;
        await QueryHandler.executeQuery('SL02', item, req, transaction);
        return item;
      })
    );
    await QueryHandler.executeQuery('SL03', data, req, transaction);
    await QueryHandler.executeQuery('SL04', data, req, transaction);
    await QueryHandler.executeQuery('SL05', data, req, transaction);
    // Stock Deduction
    // await QueryHandler.executeQuery('SL06', data, req, transaction);
    await QueryHandler.executeQuery('SL07', data, req, transaction);

    if (!isUsingExistingTransaction) {
      await transaction.commit();
    }
    return data.TempSalesID;
  }

  static async updateSalesPaymentReceipt(data, req, t = null) {
    const query = `
    UPDATE tbl_SalesPayment 
    SET Receipt = :receiptUrl, UpdatedAt = GETDATE(), UpdatedBy = :updatedBy
    WHERE IsDeleted = 0 AND TransactionID = :TransID
    `;

    await sequelize.query(query, {
      replacements: {
        receiptUrl: data.receipt,
        updatedBy: data.createdBy,
        TransID: data.transactionID,
      },
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "UPDATE SALES PAYMENT RECEIPT", sql);
      },
    });
  }

  static async ReuploadReceipt(data, req, t = null) {
    const uploadRes = await OSS.UploadReceipt(data, req);
    if (Object.keys(uploadRes).length > 0) {
      data.receipt = uploadRes.receipt;
    } else {
      throw new Error("Upload failed for Receipt");
    }

    //check if given sales have existing receipt record or not
    if (data.hasExistingRecord === false) {
      await this.updateSalesPaymentReceipt(data, req, t);
    }
  }

  static async GetOrderDetails(salesID) {
    let res = await this.getSalesBySalesID(salesID);

    switch (res[0]?.SalesType) {
      case "2": //LOT PURCHASE
        let lotDetails = await this.getLotPurchaseDetails(salesID);
        let installmentDetails = await this.getSalesInstallmentDetails(salesID);
        return { LotPurchaseDetails: lotDetails, LotPurchaseInstallment: installmentDetails };

      case "3": //FSP PURCHASE
        let fspDetails = await this.getFSPDetails(salesID);
        let fspInstallmentDetails = await this.getSalesInstallmentDetails(salesID);
        return { FSPPurchaseDetails: fspDetails, FSPPurchaseInstallment: fspInstallmentDetails };

      case "6": //LOT BOOKING
        return await this.getLotBookingDetails(salesID);

      default:
        return res;
    }
  }
}
module.exports = SalesService;
