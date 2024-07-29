const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const smtp = require("../util/email");
const config = require("../config/config.json")["smtp"];
const { ForgetPasswordToken } = require("../lib/JWT");
const { decrypt, validateMonoEndpoint, decryptMono } = require("../lib/Encryptor");
const Constants = require("../util/Constant");
const Log = require("../util/Log");
const { literal } = require("zod");

class FormService {
  static async getAddendum(data) {
    const query = `
            DECLARE @SALESID VARCHAR(50) = :salesID
            ;WITH FilteredData AS (
                SELECT
                    SalesId,
                    InstallmentNo,
                    Amount,
                    DueDate
                FROM
                    tbl_SalesInstallment
                WHERE
                    IsDeleted = 0
                    AND SalesID = @SALESID
            ),
            MaxInstallment AS (
                SELECT
                    SalesId,
                    MAX(InstallmentNo) AS MaxInstallmentNo
                FROM
                    tbl_SalesInstallment
                GROUP BY
                    SalesId
            ),
            FirstInstallment AS (
                SELECT
                    SalesId,
                    DueDate,
                    Amount AS FirstInstallmentAmount
                FROM
                    FilteredData
                WHERE
                    InstallmentNo = 1
            ),
            ConstantInstallment AS (
                SELECT
                    SalesId,
                    Amount AS ConstantInstallmentAmount
                FROM
                    FilteredData
                WHERE
                    InstallmentNo > 1
                GROUP BY
                    SalesId,
                    Amount
            ),
            InstallmentDetail AS (
            SELECT
                M.SalesId,
                m.MaxInstallmentNo,
                fi.FirstInstallmentAmount,
                fi.DueDate,
                ci.ConstantInstallmentAmount
            FROM
                MaxInstallment m
                LEFT JOIN FirstInstallment fi ON m.SalesId = fi.SalesId
                LEFT JOIN ConstantInstallment ci ON m.SalesId = ci.SalesId

            )

            SELECT MI.Fullname, MI.IC, PC.CategoryName AS 'UnitType', PO.UnitID, S.SalesID, S.SalesDate, PO.UnitPrice AS 'Total', PO.Downpayment, ID.MaxInstallmentNo AS 'Tenure', ID.ConstantInstallmentAmount, ID.FirstInstallmentAmount, ID.DueDate AS 'FirstInstallmentDueDate', DAY(ID.DueDate) AS 'FirstInstallmentDueDateDay'
            FROM tbl_Sales S WITH (NOLOCK)
            LEFT JOIN tbl_UnitPODetails PO WITH (NOLOCK)
            ON PO.IsDeleted = 0 AND PO.SalesId = S.SalesId
            LEFT JOIN tbl_MemberInfo MI WITH (NOLOCK)
            ON MI.MemberId = S.PurchaserID AND MI.IsDeleted = 0
            LEFT JOIN InstallmentDetail ID 
            ON ID.SalesID = S.SalesId
			LEFT JOIN tbl_UnitCollection UC WITH (NOLOCK)
			ON UC.IsDeleted = 0 AND UC.UnitID = S.UnitID
            LEFT JOIN tbl_Product_Category PC WITH (NOLOCK)
			ON PC.IsDeleted = 0 AND PC.ID = UC.CategoryID
            WHERE S.SalesId = @SALESID;
        `;
    const result = await sequelize.query(query, {
      replacements: { salesID: data.salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }

  static async getPO(data) {
    let query = `
            DECLARE @SALESID VARCHAR(50) = :salesID
			DECLARE @ISFULLPAYMENT INT = (SELECT TOP 1 InstallmentNo FROM tbl_SalesInstallment WITH (NOLOCK) WHERE SalesID = @SALESID ORDER BY InstallmentNo ASC)
			DECLARE @PAYMENTTYPE VARCHAR(250);
			DECLARE @PAYMENTAMOUNT DECIMAL(18,2);
			
			SELECT TOP 1 @PAYMENTTYPE = SP.PaymentType, @PAYMENTAMOUNT = SP.Amount 
			FROM tbl_SalesPayment SP WITH (NOLOCK) WHERE SP.SalesID = @SALESID AND SP.PaymentPurpose IN (1,8) ORDER BY ID DESC

            SELECT PO.UnitID, PC.CategoryName AS 'UnitType', S.SalesID, S.SalesDate, PO.UnitPrice AS 'Total', PO.Downpayment, MIA.Fullname AS 'Agent_Fullname', MIA.AgentID,
			MI.Fullname, MI.IC, C.Country_Nationality, MI.Gender, MI.DOB,
			(MI.ResidentialAddress + 
			CASE WHEN MI.ResidentialAddress2 IS NULL THEN '' ELSE ', ' + MI.ResidentialAddress2 END + 
			CASE WHEN MI.ResidentialAddress3 IS NULL THEN '' ELSE ', ' + MI.ResidentialAddress3 END +
			CASE WHEN MI.ResidentialCity IS NULL THEN '' ELSE ', ' + MI.ResidentialCity END +
			CASE WHEN MI.ResidentialState IS NULL THEN '' ELSE ', ' + S1.State_Name END +
			CASE WHEN MI.ResidentialPostCode IS NULL THEN '' ELSE ', ' + MI.ResidentialPostCode END +
			CASE WHEN MI.ResidentialCountry IS NULL THEN '' ELSE ', ' + C1.Country_Name END) AS 'ResidentialAddress',
			MI.ResidentialPostCode AS 'ResidentialPostCode',
			(MI.MailingAddress + 
			CASE WHEN MI.MailingAddress2 IS NULL THEN '' ELSE ', ' + MI.MailingAddress2 END + 
			CASE WHEN MI.MailingAddress3 IS NULL THEN '' ELSE ', ' + MI.MailingAddress3 END +
			CASE WHEN MI.MailingCity IS NULL THEN '' ELSE ', ' + MI.MailingCity END +
			CASE WHEN MI.MailingState IS NULL THEN '' ELSE ', ' + S2.State_Name END +
			CASE WHEN MI.MailingPostCode IS NULL THEN '' ELSE ', ' + MI.MailingPostCode END +
			CASE WHEN MI.MailingCountry IS NULL THEN '' ELSE ', ' + C2.Country_Name END) AS 'MailingAddress',
			MI.MailingPostCode AS 'MailingPostCode',
			MI.MobileCode + MI.Mobile AS 'MobileNumber', MI.Email,
			UC.ZoneX, UC.RowX, UC.AreaSize,
			PO.UnitPrice - ISNULL(PO.UnitDiscount, 0) - ISNULL(PO.BookingReceived, 0) AS 'UnitPrice',
			PO.MaintenanceFee, PO.UnitPrice - ISNULL(PO.UnitDiscount, 0) - ISNULL(PO.BookingReceived, 0) + ISNULL(PO.MaintenanceFee, 0) AS 'TotalPrice',
			CASE WHEN @ISFULLPAYMENT > 0 THEN 0 ELSE 1 END AS 'IsFullPayment', CASE WHEN P1.ParameterValue = '5' THEN 'CASH' WHEN P1.ParameterValue IN (100, 66) THEN 'BANK' ELSE 'OTHER' END AS 'PaymentType', 
            @PAYMENTAMOUNT AS 'PaidAmount'
            FROM tbl_Sales S WITH (NOLOCK)
            LEFT JOIN tbl_UnitPODetails PO WITH (NOLOCK)
            ON PO.IsDeleted = 0 AND PO.SalesId = S.SalesId
			LEFT JOIN tbl_UnitCollection UC WITH (NOLOCK)
			ON UC.IsDeleted = 0 AND UC.UnitID = S.UnitID
            LEFT JOIN tbl_Product_Category PC WITH (NOLOCK)
			ON PC.IsDeleted = 0 AND PC.ID = UC.CategoryID
			LEFT JOIN tbl_Parameter P1 WITH (NOLOCK)
			ON P1.Category = 'PaymentType' AND P1.ParameterValue = @PAYMENTTYPE
            LEFT JOIN tbl_MemberInfo MI WITH (NOLOCK)
            ON MI.MemberId = S.PurchaserID AND MI.IsDeleted = 0
			LEFT JOIN tbl_MemberInfo MIA WITH (NOLOCK)
            ON MIA.MemberId = S.MemberID AND MIA.IsDeleted = 0
			LEFT JOIN tbl_Country C WITH (NOLOCK)
			ON C.IsDeleted = 0 AND C.ID = MI.Nationality
			LEFT JOIN tbl_Country C1 WITH (NOLOCK)
			ON C1.IsDeleted = 0 AND C1.ID = MI.ResidentialCountry
			LEFT JOIN tbl_Country C2 WITH (NOLOCK)
			ON C2.IsDeleted = 0 AND C2.ID = MI.MailingCountry
			LEFT JOIN tbl_State S1 WITH (NOLOCK)
			ON S1.IsDeleted = 0 AND S1.ID = MI.ResidentialState
			LEFT JOIN tbl_State S2 WITH (NOLOCK)
			ON S2.IsDeleted = 0 AND S2.ID = MI.MailingState
            WHERE S.SalesId = @SALESID;

        `;
    const result = await sequelize.query(query, {
      replacements: { salesID: data.salesID },
      type: Sequelize.QueryTypes.SELECT,
    });

    let result1 = result[0];
    result1.PaymentType === "CASH"
      ? (result1.cash = result1.PaidAmount)
      : result1.PaymentType === "BANK"
        ? (result1.paymentbank = result1.PaidAmount)
        : (result1.paymentOthers = result1.PaidAmount);

    result1.paymenttotal = result1.PaidAmount;

    query = `
            DECLARE @SALESID VARCHAR(50) = :salesID
			SELECT IU.FullName, IU.ChineseName, IU.IC, P.ParameterName_EN AS 'Relationship', IU.Gender  
			FROM tbl_Sales S WITH (NOLOCK) 
			LEFT JOIN tbl_Unit_IntendedUser IU WITH (NOLOCK)
			ON IU.IsDeleted = 0 AND IU.StatusX = 1 AND IU.UnitID = S.UnitID
			LEFT JOIN tbl_Parameter P WITH (NOLOCK)
			ON P.Category = 'Relationship' AND P.ParameterValue = IU.Relationship
			WHERE S.SalesId = @SALESID
    `;
    const result2 = await sequelize.query(query, {
      replacements: { salesID: data.salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return { details: result1, iu: result2 };
  }

  static async getMiscellaneousInvoice(data) {
    const query = `
        SELECT S.SalesId, MI.Fullname AS 'PurchaserName', MI.MobileCode + MI.Mobile AS 'PurchaserMobileNumber',
		S.TotalPrice, S.Remarks, P1.ParameterName_EN AS 'PaymentPurpose', P2.ParameterName_EN AS 'PaymentType',
		S.MemberId AS 'AgentMemberID', MIA.AgentID AS 'AgentID', CONVERT(VARCHAR, SP.TransactionDate, 105) AS 'TransactionDate'
		FROM tbl_Sales S WITH (NOLOCK)
		LEFT JOIN tbl_MemberInfo MI WITH (NOLOCK)
		ON MI.MemberId = S.PurchaserID AND MI.IsDeleted = 0
					LEFT JOIN tbl_MemberInfo MIA WITH (NOLOCK)
					ON MIA.MemberId = S.MemberID AND MIA.IsDeleted = 0
		LEFT JOIN tbl_SalesPayment SP WITH (NOLOCK)
		ON SP.SalesId = S.SalesId AND SP.IsDeleted = 0
		LEFT JOIN tbl_Parameter P1 WITH (NOLOCK)
		ON P1.Category = 'PaymentPurpose' AND P1.ParameterValue = SP.PaymentPurpose
		LEFT JOIN tbl_Parameter P2 WITH (NOLOCK)
		ON P2.Category = 'PaymentType' AND P2.ParameterValue = SP.PaymentType
		WHERE S.SalesType = 5 AND S.SalesID = :salesID
    `;
    const result = await sequelize.query(query, {
      replacements: { salesID: data.salesID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
}
module.exports = FormService;
