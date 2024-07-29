const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const Log = require("../util/Log");

class MemberService {
  static async validateMemberID(memberID) {
    const query = `
    SELECT MemberID FROM tbl_memberInfo WITH (NOLOCK) WHERE IsDeleted = 0 AND MemberID = :memberID
    `;
    const result = await sequelize.query(query, {
      replacements: { memberID: memberID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.MemberID === undefined || result[0]?.MemberID === null;
  }
  static async validateAgent(memberID) {
    const query = `
    SELECT m.MemberID FROM tbl_memberInfo m WITH (NOLOCK) 
    INNER JOIN tbl_Login l WITH (NOLOCK) ON l.LoginUsername = m.Username
    WHERE m.IsDeleted = 0 AND m.MemberID = :memberID AND l.LoginRole = 'M'
    `;
    const result = await sequelize.query(query, {
      replacements: { memberID: memberID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.MemberID === undefined || result[0]?.MemberID === null;
  }
  static async validateCustomer(memberID) {
    const query = `
    SELECT m.MemberID FROM tbl_memberInfo m WITH (NOLOCK) 
    WHERE m.IsDeleted = 0 AND m.MemberID = :memberID AND m.Ranking = 0
    `;
    const result = await sequelize.query(query, {
      replacements: { memberID: memberID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.MemberID === undefined || result[0]?.MemberID === null;
  }
  static async validateDownline(memberID, searchID){
    const query = `
      SELECT [dbo].[DEMO_CheckValidSponsorLine](:MemberID, :SearchID) AS 'RES';
    `;

    const result = await sequelize.query(query, {
      replacements: { MemberID: memberID, SearchID: searchID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.RES === "1";
  }
  static async getUserRole(memberID) {
    const query = `
    SELECT 
      CASE WHEN m.Ranking ='0' THEN 'C' ELSE ISNULL(l.LoginRole, 'C') END AS 'LoginRole' 
    FROM tbl_memberInfo m WITH (NOLOCK)
    LEFT JOIN tbl_Login l WITH (NOLOCK) ON l.LoginUsername = m.Username
    WHERE m.IsDeleted = 0 AND (m.MemberID = :memberID OR m.AgentID = :memberID)
    `;
    const result = await sequelize.query(query, {
      replacements: { memberID: memberID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.LoginRole;
  }
  static async findMemberByMemberID(memberID) {
    const query = `
    SELECT 
      m.[MemberId], ISNULL(m.[AgentID], '-') AS 'AgentID', m.[Username], m.[FirstName], m.[LastName], m.Fullname, ISNULL(m1.[MemberId], '-') AS 'SponsorID', ISNULL(m1.[Fullname], '-') AS 'SponsorName'
      , m.[Ranking], r.[RankName] AS 'RankName', CONVERT(VARCHAR, m.[SignUpdate], 120) AS 'SignUpDate', ISNULL(m.[Email], '-') AS 'Email',  m.[MobileCode], m.[Mobile]
      , m.[IC_Type] AS 'IdentityTypeValue', ISNULL(p1.[ParameterName], '-') AS 'IdentityTypeName', m.[IC], ISNULL(m.[Gender], '-') AS 'Gender', ISNULL(CONVERT(VARCHAR, m.[DOB], 23), '-') AS 'DOB', ISNULL(m.[Nationality], '-') AS 'Nationality', ISNULL(c1.[Country_Name], '-') AS 'NationalityName'
      , ISNULL(m.[MaritalStatus], '-') AS 'MaritalStatus', ISNULL(p2.ParameterName, '-') AS 'MaritalStatusName', ISNULL(m.[Religion], '-') AS 'Religion'
      , m.[ResidentialAddress], ISNULL(m.[ResidentialAddress2], '-') AS 'ResidentialAddress2', ISNULL(m.[ResidentialAddress3], '-') AS 'ResidentialAddress3'
      , ISNULL(m.[ResidentialCity], '-') AS 'ResidentialCity', ISNULL(m.[ResidentialState], '-') AS 'ResidentialState', ISNULL(s.State_Name, '-') AS 'ResidentialStateName', ISNULL(m.[ResidentialPostCode], '-') AS 'ResidentialPostCode', m.[ResidentialCountry], ISNULL(c2.[Country_Name], '-') AS 'ResidentialCountryName'
      , m.[Bank], ISNULL(m.[BankName], '-') AS 'BankName', ISNULL(m.[BankBranch], '-') AS 'BankBranch', ISNULL(m.[BankAccountNo], '-') AS 'BankAccountNo', m.[BankAccountHolder], l.loginRole AS 'Role'
    FROM tbl_memberInfo m WITH (NOLOCK) 
    LEFT JOIN tbl_Login L WITH (NOLOCK) ON m.Username = L.loginUsername 
    LEFT JOIN tbl_MemberInfo m1 WITH (NOLOCK) ON m1.IsDeleted = 0 AND m1.MemberID = m.SponsorID
    LEFT JOIN tbl_Parameter p1 WITH (NOLOCK) ON p1.Category = 'IdentityType' AND p1.ParameterValue = m.IC_Type
    LEFT JOIN tbl_Parameter p2 WITH (NOLOCK) ON p2.Category = 'Marriage' AND p2.ParameterValue = m.MaritalStatus
    LEFT JOIN tbl_Country c1 WITH (NOLOCK) ON c1.IsDeleted = 0 AND c1.Id = m.Nationality
    LEFT JOIN tbl_Country c2 WITH (NOLOCK) ON c1.IsDeleted = 0 AND c2.Id = m.ResidentialCountry
    LEFT JOIN tbl_State s WITH (NOLOCK) ON s.IsDeleted = 0 AND s.Id = m.ResidentialState AND s.State_Country = m.ResidentialCountry
    LEFT JOIN tbl_Rank r WITH (NOLOCK) ON r.IsDeleted = 0 AND r.Ranking = m.Ranking
    WHERE m.IsDeleted = 0 AND m.MemberID = :memberID
    `;
    const result = await sequelize.query(query, {
      replacements: { memberID: memberID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0];
  }

  static async findMembers(body) {
    const offset = (body.pageNumber - 1) * body.pageSize;
    const replacements = { offset: offset, pageSize: body.pageSize };

    let query = `
    FROM tbl_memberInfo MI WITH (NOLOCK)
    LEFT JOIN tbl_Login L WITH (NOLOCK)
      ON MI.Username = L.loginUsername
    WHERE MI.IsDeleted = 0
    `;
    if (body.role != null) {
      if (body.role === "C") {
        query += `
        AND MI.Ranking = :loginRole
        `;
      } else {
        query += `
        AND MI.Ranking <> 0 AND L.loginRole = :loginRole
        `;
      }

      replacements.loginRole = body.role === "C" ? "0" : body.role;
    }
    else {
      // DONT SHOW CUSTOMER IN OVERALL MEMBER LIST
      query += `
        AND MI.Ranking <> 0 
        `;
    }

    if (body.agentOrPurchaserID != null) {
      if (body.role != null && body.role === "C"){
        query += `
        AND MI.MemberID LIKE :PurchaserID
          `;
        replacements.PurchaserID = `%${body.agentOrPurchaserID}%`;
      }
      else {
        query += `
        AND MI.AgentID LIKE :agentID
          `;
        replacements.agentID = `%${body.agentOrPurchaserID}%`;
      }
    }

    if (body.isKYC != null) {
      query += `
      AND MI.IsKYC = :isKYC
        `;
      replacements.isKYC = body.isKYC;
    }
    
    if (body.name != null) {
      query += `
      AND MI.Fullname LIKE :name
        `;
      replacements.name = `%${body.name}%`;
    }
    if (body.ic != null) {
      query += `
      AND MI.IC LIKE :ic
        `;
      replacements.ic = `%${body.ic}%`;
    }

    const countQuery = `
        SELECT COUNT(*) AS Total
        ${query} 
    `;

    query = `
      SELECT MI.*
      ${query}
    `;

    query += `
    ORDER BY MI.Id
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

    if (body.role != null && body.role === "C" && result.length > 0){
      const memberIds = result.map(member => member.MemberId);

      const itemsQuery = `
          SELECT 
            MI.MemberID,
            (
                SELECT DISTINCT
                    ISNULL(ISNULL(UC.UnitID, P.ProductName), '-') AS ItemName
                FROM tbl_Sales a
                LEFT JOIN tbl_SalesDetails b ON b.IsDeleted = 0 AND b.SalesId = a.SalesId
                LEFT JOIN tbl_UnitCollection UC ON UC.IsDeleted = 0 AND UC.UnitID = ISNULL(a.UnitID, b.ProductCode)
                LEFT JOIN tbl_Product P ON P.IsDeleted = 0 AND P.StatusX = 1 AND P.ProductCode = ISNULL(a.UnitID, b.ProductCode)
                WHERE a.IsDeleted = 0 AND a.PurchaserID = MI.MemberID
                FOR JSON PATH
            ) AS Items
          FROM tbl_memberInfo MI
          WHERE MI.MemberID IN (:memberIds) AND MI.IsDeleted = 0
      `;

      const itemsResult = await sequelize.query(itemsQuery, {
        replacements: { memberIds },
        type: Sequelize.QueryTypes.SELECT,
      });
      

      // Transforming the items result to a map for easy lookup
      const itemsMap = itemsResult.reduce((acc, item) => {
        acc[item.MemberID] = item.Items ? JSON.parse(item.Items).map(i => i.ItemName) : [];
        return acc;
      }, {});

      // Combining members and their items
      const formattedResult = result.map(member => ({
          Items: itemsMap[member.MemberId] || [],
          ...member,
      }));

      return { data: formattedResult, totalRows: totalCount[0].Total };
    }
    else {
      return { data: result, totalRows: totalCount[0].Total };
    }
  }

  static async getSponsorTree(memberID){
    const query = `
      DECLARE @MEMBERID NVARCHAR(50) = :MemberID;
      DECLARE @SPONSORINDEX NVARCHAR(MAX) = (SELECT SponsorIndex FROM tbl_MemberInfo WITH (NOLOCK) WHERE IsDeleted = 0 AND MemberID = @MEMBERID);
      DECLARE @LEVELX INT = (SELECT Levelx FROM tbl_MemberInfo WITH (NOLOCK) WHERE IsDeleted = 0 AND MemberID = @MEMBERID);

      SELECT 
      M.MemberID, M.Username, M.Fullname, 
      ISNULL(M.ChineseName, '-') AS 'ChineseName', ISNULL(M.AgentID, '-') AS 'AgentID', 
      (M.LevelX - @LEVELX) AS 'LevelX', 
      ISNULL(M.SponsorID, '-') AS 'SponsorID', 
      ISNULL(UM.Username, '-') AS 'SponsorUsername', 
      ISNULL(UM.Fullname, '-') AS 'SponsorName', 
      P1.ParameterName AS 'Status', 
      M.Ranking AS 'Ranking', R.RankName AS 'RankName', 
      CONVERT(VARCHAR(10), M.SignUpDate, 120) AS 'SignUpDate'
      FROM tbl_MemberInfo M WITH (NOLOCK)
      LEFT JOIN Tbl_Rank R WITH (NOLOCK) ON R.IsDeleted = 0 AND R.Ranking = M.Ranking 
      LEFT JOIN tbl_Parameter P1 WITH (NOLOCK) ON P1.Category = 'MemberStatus' AND P1.ParameterValue = M.StatusX 
      LEFT JOIN tbl_MemberInfo UM WITH(NOLOCK) ON UM.IsDeleted = 0 AND UM.MemberID = M.SponsorID
      WHERE M.IsDeleted = 0 AND M.Ranking <> 0 AND M.SponsorIndex LIKE @SPONSORINDEX + '%' AND M.LevelX <= (@LEVELX + 7)
      ORDER BY M.LevelX ASC
    `;

    const result = await sequelize.query(query, {
      replacements: { MemberID: memberID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }

  static async getPendingApprovalMemberList(data) {
    const offset = (data.pageNumber - 1) * data.pageSize;
    const replacements = { offset: offset, pageSize: data.pageSize };

    // 0 - pending, 1 - approved, 2 - rejected
    let query = `
    FROM tbl_MemberInfo m WITH (NOLOCK)
    INNER JOIN tbl_Login l WITH (NOLOCK) ON l.LoginUsername = m.IC
    LEFT JOIN tbl_RoleControl rc WITH (NOLOCK) ON rc.isDeleted = 0 AND rc.RoleID = l.LoginRole
    LEFT JOIN tbl_Parameter p1 WITH (NOLOCK) ON p1.Category = 'MemberStatus' AND p1.ParameterValue = m.StatusX
    LEFT JOIN tbl_Parameter p2 WITH (NOLOCK) ON p2.Category = 'IdentityType' AND p2.ParameterValue = m.IC_Type
    WHERE m.IsDeleted = 0 AND l.LoginRole <> 'AD' AND m.SignUpDate BETWEEN :signUpDateFrom AND :signUpDateTo
    `;

    replacements.signUpDateFrom = data.signUpDateFrom + " 00:00:00";
    replacements.signUpDateTo = data.signUpDateTo + " 23:59:59.997";

    if (data.memberID_Name_IC != null && data.memberID_Name_IC !== "") {
      query += `
      AND (m.MemberId LIKE '%:memberID_Name_IC%' OR m.AgentID LIKE '%memberID_Name_IC%' OR
           m.Fullname LIKE '%:memberID_Name_IC%' OR m.IC LIKE '%memberID_Name_IC%')
      `;
      replacements.memberID_Name_IC = `%${data.memberID_Name_IC}%`;
    }

    if (data.role != null && data.role !== "") {
      query += `
      AND l.LoginRole = :loginRole
      `;
      replacements.loginRole = data.role;
    }

    if (data.memberStatus != null && data.memberStatus !== "") {
      query += `
      AND m.StatusX = :memberStatus
      `;
      replacements.memberStatus = data.memberStatus;
    }

    if (data.identityType != null && data.identityType !== "") {
      query += `
      AND m.IC_Type = :identityType
      `;
      replacements.identityType = data.identityType;
    }

    if (data.kycStatus != null && data.kycStatus !== "") {
      query += `
      AND m.isKYC = :kycStatus
      `;
      replacements.kycStatus = data.kycStatus;
    }

    const countQuery = `
        SELECT COUNT(*) AS Total
        ${query} 
    `;
    query = `
      SELECT 
        m.MemberId, ISNULL(m.AgentID, '-') AS 'AgentID', m.Fullname, m.IC AS 'IdentityCardNumber', 
        CONVERT(VARCHAR, m.SignUpDate, 120) AS 'SignUpDate', 
        l.LoginRole, rc.RoleName, p1.ParameterName AS 'MemberStatus', 
        p2.ParameterName AS 'IdentityType', 
        CASE WHEN m.isKYC = '0' THEN 'Pending' WHEN m.isKYC = '1' THEN 'Approved' ELSE 'Rejected' END AS 'KYC_Status',
        ISNULL(m.FU_ICFront, '-') AS 'IC_Front_Doc', 
        ISNULL(m.FU_ICBack, '-') AS 'IC_Back_Doc', 
        ISNULL(m.FU_CompanyProfile, '-') AS 'CompanyProfile_Doc',
        ISNULL(m.FU_Accounts, '-') AS 'CompanyAccount_Doc'
      ${query}
    `;

    query += `
    ORDER BY m.Id
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
  static async getUploadedDocumentByMemberID(memberID) {
    const query = `
    SELECT  
      ISNULL(FU_ICFront, '-') AS 'Front_IC_Doc', 
      ISNULL(FU_ICBack, '-') AS 'Back_IC_Doc', 
      ISNULL(FU_CompanyProfile, '-') AS 'Company_Profile_Doc', 
      ISNULL(FU_Sec17, '-') AS 'Company_Sec17_Doc', 
      ISNULL(FU_Memorandum, '-') AS 'Company_Memorandum_Doc', 
      ISNULL(FU_Sec14, '-') AS 'Company_Sec14_Doc', 
      ISNULL(FU_Sec46, '-') AS 'Company_Sec46_Doc', 
      ISNULL(FU_Sec51, '-') AS 'Company_Sec51_Doc', 
      ISNULL(FU_Accounts, '-') AS 'Company_Account_Doc'
    FROM tbl_MemberInfo WITH (NOLOCK)
    WHERE IsDeleted = 0 AND MemberID = :MemberID
    `;

    const result = await sequelize.query(query, {
      replacements: { MemberID: memberID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  static async validateCountry(country) {
    const query = `
      SELECT ID FROM tbl_Country WITH (NOLOCK) WHERE ID = :country
    `;
    const result = await sequelize.query(query, {
      replacements: { country: country },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.ID === undefined || result[0]?.ID === null;
  }
  static async validateBankCode(bankCode) {
    const query = `
      SELECT ID FROM tbl_Banks WITH (NOLOCK) WHERE BankCode = :bankCode
    `;
    const result = await sequelize.query(query, {
      replacements: { bankCode: bankCode },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.ID === undefined || result[0]?.ID === null;
  }
  static async validateState(state) {
    const query = `
      SELECT ID FROM tbl_State WITH (NOLOCK) WHERE ID = :state
    `;
    const result = await sequelize.query(query, {
      replacements: { state: state },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.ID === undefined || result[0]?.ID === null;
  }
  static async validateIC(ic, role) {
    const query = `
    SELECT TM.IC
    FROM 
        tbl_login TL WITH (NOLOCK)
    LEFT JOIN 
        tbl_MemberInfo TM WITH (NOLOCK) ON TL.loginUsername = CASE WHEN TM.Username = '' THEN TM.IC ELSE TM.Username END
    WHERE 
        TM.IsDeleted = 0 AND TL.loginRole = :role
        AND TM.IC = :IC;
    `;
    const result = await sequelize.query(query, {
      replacements: { IC: ic, role: role },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.IC === undefined || result[0]?.IC === null;
  }
  static async validateUsername(username, role) {
    const query = `
    SELECT TL.loginUsername
    FROM 
      tbl_Login TL WITH (NOLOCK)
    LEFT JOIN 
      tbl_MemberInfo TM WITH (NOLOCK) ON TL.loginUsername = CASE WHEN TM.Username = '' THEN TM.IC ELSE TM.Username END
    WHERE TM.IsDeleted = 0 AND TL.loginRole = :role AND TL.loginUsername = :username
    `;
    const result = await sequelize.query(query, {
      replacements: { username: username, role: role },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.loginUsername === undefined || result[0]?.loginUsername === null;
  }
  static async getSponsorIndex(sponsorID) {
    const query = `
    SELECT ISNULL(SponsorIndex, '~000001~') AS 'SponsorIndex', ISNULL(Levelx, 0) AS 'Levelx' FROM Tbl_Unit WITH (NOLOCK) WHERE IsDeleted = 0 AND MemberID = :memberId;
    `;
    const result = await sequelize.query(query, {
      replacements: { memberId: sponsorID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return {
      sponsorIndex: result[0]?.SponsorIndex || null,
      level: result[0]?.Levelx == null ? null : result[0]?.Levelx,
    };
  }
  static async generateMemberID(Role) {
    const query = `
      DECLARE @MID AS NVARCHAR(50); EXEC [dbo].[TAOWAR_GenerateMemberID] @ROLE = :Role, @NEWMEMBERID = @MID OUTPUT;
    `;
    const result = await sequelize.query(query, {
      replacements: { Role: Role },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0].MemberID;
  }
  static async findBank(bank) {
    const query = `
      SELECT TOP 1 * FROM tbl_Banks WITH (NOLOCK) WHERE BankCode = :bankCode AND Bank_Status = 1
    `;
    const result = await sequelize.query(query, {
      replacements: { bankCode: bank },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0];
  }
  static async updateKYC(body, req) {
    const query = `
      UPDATE Tbl_MemberInfo SET IsKYC = :IsKYC WHERE MemberID = :MemberID
    `;
    const result = await sequelize.query(query, {
      replacements: { IsKYC: body.status ? "1" : "2", MemberID: body.memberID },
      type: Sequelize.QueryTypes.UPDATE,
      logging: (sql, timing) => {
        Log.LogAction(req, "UPDATE MEMBER KYC STATUS", sql);
      },
    });
  }

  static async changePassword(body) {
    const query = `
    DECLARE @USERNAME VARCHAR(MAX) = (SELECT Username FROM tbl_MemberInfo WHERE MemberId = :MemberID);

    UPDATE tbl_login SET loginPassword = :Password WHERE loginUsername = @USERNAME;
  `;
    const result = await sequelize.query(query, {
      replacements: { Password: body.password, MemberID: body.memberID },
      type: Sequelize.QueryTypes.UPDATE,
      logging: (sql, timing) => {
        Log.LogAction(req, "CHANGE PASSWORD", sql);
      },
    });
  }

  static async createMember(body, req, t = null) {
    let query = ``;
    if (body.role != "C") {
      query = `
      INSERT INTO Tbl_Login (LoginUsername, LoginPassword, SecPassword, LoginStatus, LoginRole, FirstLogin)
      VALUES (:username, :password, :password, 1, :loginRole, 1);
    `;
      await sequelize.query(query, {
        replacements: {
          username: body.username,
          password: body.password,
          loginRole: body.role,
        },
        type: Sequelize.QueryTypes.INSERT,
        transaction: t,
        logging: (sql, timing) => {
          Log.LogAction(req, "INSERT LOGIN", sql, t);
        },
      });
    }

    query = `
      INSERT INTO Tbl_MemberInfo (MemberID, DisplayName, Username, Ranking, FirstName, LastName, Fullname, IC_Type, IC, Email, MobileCode,
         Mobile, MobileCode2, Mobile2, Gender, Nationality, DOB, StatusX, SignupDate, ResidentialAddress, ResidentialAddress2, ResidentialAddress3,
          ResidentialCity, ResidentialPostCode, ResidentialState, ResidentialCountry, MailingAddress, MailingAddress2, MailingAddress3,
          MailingCity, MailingPostCode, MailingState, MailingCountry, CreatedBy,
          SponsorID, SponsorIndex, Levelx,
          Bank, BankName, BankBranch, BankAccountNo, BankAccountHolder,
          FU_ICFront, FU_ICBack, FU_CompanyProfile, FU_Memorandum, FU_Sec14, FU_Sec17, FU_Sec46, FU_Sec51, FU_Accounts
        )
      VALUES (:memberID, :displayName, :username, :ranking, :firstName, :lastName, :fullname, :identityType, :IC, :email, :mobileCode,
       :mobile, :mobileCode2, :mobile2, :gender, :nationality, :DOB, :status, GETDATE(), :residentialAddressOne, NULLIF(:residentialAddressTwo, ''), NULLIF(:residentialAddressThree, ''),
        :residentialCity, :residentialPostCode, :residentialState, :residentialCountry, :mailingAddressOne, NULLIF(:mailingAddressTwo, ''), NULLIF(:mailingAddressThree, ''),
        :mailingCity, :mailingPostCode, :mailingState, :mailingCountry, :createdBy,
        :sponsorID, :sponsorIndex, :levelx,
        :bank, :bankName, :bankBranch, :bankAccountNo, :bankAccountHolder,
        NULLIF(:FU_ICFront, ''), NULLIF(:FU_ICBack, ''), NULLIF(:FU_CompanyProfile, ''), NULLIF(:FU_Memorandum, ''), NULLIF(:FU_Sec14, ''), NULLIF(:FU_Sec17, ''), NULLIF(:FU_Sec46, ''), NULLIF(:FU_Sec51, ''), NULLIF(:FU_Accounts, '')
      );
    `;
    await sequelize.query(query, {
      replacements: {
        memberID: body.memberID,
        displayName: body.displayName,
        username: body.username,
        ranking: body.ranking,
        firstName: body.firstName,
        lastName: body.lastName,
        fullname: body.fullName,
        identityType: body.identityType,
        IC: body.identityNo,
        email: body.email,
        mobileCode: body.mobileCode,
        mobile: body.mobile,
        mobileCode2: body.mobileCode2,
        mobile2: body.mobile2,
        gender: body.gender,
        nationality: body.nationality,
        DOB: body.DOB,
        status: body.status,
        residentialAddressOne: body.residentialAddress.addressOne,
        residentialAddressTwo:
          body.residentialAddress.addressTwo === undefined || body.residentialAddress.addressTwo === null
            ? ""
            : body.residentialAddress.addressTwo,
        residentialAddressThree:
          body.residentialAddress.addressThree === undefined || body.residentialAddress.addressThree === null
            ? ""
            : body.residentialAddress.addressThree,
        residentialCity: body.residentialAddress.city,
        residentialPostCode: body.residentialAddress.postCode,
        residentialState: body.residentialAddress.state,
        residentialCountry: body.residentialAddress.country,
        mailingAddressOne: body.mailingAddress.addressOne,
        mailingAddressTwo:
          body.mailingAddress.addressTwo === undefined || body.mailingAddress.addressTwo === null
            ? ""
            : body.mailingAddress.addressTwo,
        mailingAddressThree:
          body.mailingAddress.addressThree === undefined || body.mailingAddress.addressThree === null
            ? ""
            : body.mailingAddress.addressThree,
        mailingCity: body.mailingAddress.city,
        mailingPostCode: body.mailingAddress.postCode,
        mailingState: body.mailingAddress.state,
        mailingCountry: body.mailingAddress.country,
        createdBy: body.memberID,
        sponsorID: body.sponsorID,
        sponsorIndex: body.sponsorIndex,
        levelx: body.level,
        bank: body.bankCode || null,
        bankName: body.bankName || null,
        bankBranch: body.bankBranch || null,
        bankAccountNo: body.bankAccountNo || null,
        bankAccountHolder: body.bankAccountHolder || null,
        FU_ICFront: body.ICFront === undefined ? "" : body.ICFront,
        FU_ICBack: body.ICBack === undefined ? "" : body.ICBack,
        FU_CompanyProfile: body.companyProfile === undefined ? "" : body.companyProfile,
        FU_Memorandum: body.memorandum === undefined ? "" : body.memorandum,
        FU_Sec14: body.sec14 === undefined ? "" : body.sec14,
        FU_Sec17: body.sec17 === undefined ? "" : body.sec17,
        FU_Sec46: body.sec46 === undefined ? "" : body.sec46,
        FU_Sec51: body.sec51 === undefined ? "" : body.sec51,
        FU_Accounts: body.accounts === undefined ? "" : body.accounts,
      },
      type: Sequelize.QueryTypes.INSERT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "INSERT MEMBER INFO", sql, t);
      },
    });
    query = `
    INSERT INTO Tbl_Unit (MemberID, UnitID, Ranking, UnitSponsor, SponsorIndex, LevelX, CreatedBy) VALUES
    (:memberID, :memberID, :ranking, :sponsorID, :sponsorIndex, :level, :createdBy)
    `;
    await sequelize.query(query, {
      replacements: {
        memberID: body.memberID,
        ranking: body.ranking,
        sponsorID: body.sponsorID,
        sponsorIndex: body.sponsorIndex,
        level: body.level,
        createdBy: body.memberID,
      },
      type: Sequelize.QueryTypes.INSERT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "INSERT UNIT", sql, t);
      },
    });
    return body.memberID;
  }
}
module.exports = MemberService;
