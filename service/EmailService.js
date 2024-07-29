const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const smtp = require("../util/email");
const config = require("../config/config.json")["smtp"];
const { ForgetPasswordToken } = require("../lib/JWT");
const { decrypt, validateMonoEndpoint, decryptMono } = require("../lib/Encryptor");
const Constants = require("../util/Constant");
const { format } = require("date-fns-tz");

class EmailService {
  static replacePlaceholders(template, replacements) {
    let content = template;

    for (const key in replacements) {
      if (replacements.hasOwnProperty(key)) {
        const placeholder = `{${key}}`;
        content = content.split(placeholder).join(replacements[key]);
      }
    }

    return content;
  }
  static async getEmailTemplate(type) {
    const query = `SELECT TOP(1) * FROM tbl_Emailtemplate WITH (NOLOCK) WHERE EmailType = :type`;
    const result = await sequelize.query(query, {
      replacements: { type: type },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }

  static async forgetPasswordEmail(username) {
    const query = `
    SELECT TOP 1 
        TM.fullName AS 'MemberName', 
        TM.memberId AS 'MemberID', 
        TM.email AS 'MemberEmail'
    FROM 
        tbl_login TL
    LEFT JOIN 
        tbl_MemberInfo TM ON TL.loginUsername = CASE WHEN TM.Username = '' THEN TM.IC ELSE TM.Username END
    WHERE 
        TL.loginRole IN ('M', 'AD') 
        AND TL.loginUsername = :loginUsername;
    `;
    const result = await sequelize.query(query, {
      replacements: { loginUsername: username },
      type: Sequelize.QueryTypes.SELECT,
    });
    if (result.length > 0) {
      if (result[0].MemberEmail == null || result[0].MemberEmail === "") {
        return false;
      }
      const token = await ForgetPasswordToken({
        name: result[0].MemberName,
        memberID: result[0].MemberID,
        email: result[0].MemberEmail,
      });
      if (token == null) {
        return false;
      }
      const malaysiaTimezone = "Asia/Kuala_Lumpur";
      const issuedAt = format(token.issuedAt, "yyyy-MM-dd HH:mm:ss.SSS");
      const expiresAt = format(token.expiresAt, "yyyy-MM-dd HH:mm:ss.SSS");
      // Will need to add MemberID to the Url_Domain in the email template
      let emailTemplate = await this.getEmailTemplate("3");
      const replacements = {
        Token_ID: token.token,
        Request_StartDate: issuedAt,
        Request_EndDate: expiresAt,
        Member_Name: result[0].MemberName,
        Url_Domain: Constants.currentUrl,
      };
      const replacedContent = this.replacePlaceholders(emailTemplate[0].Messagex, replacements);
      const mailOptions = {
        from: decrypt(config.username),
        to: result[0].MemberEmail,
        subject: emailTemplate[0].Subjectx,
        html: replacedContent,
      };
      await smtp.sendMail(mailOptions);
      return true;
    } else {
      return false;
    }
  }

  static async sendTestEmail(to) {
    const mailOptions = {
      from: decrypt(config.username),
      to: "email",
      subject: "test",
      html: "test",
      // attachments: strAttachment === undefined ? [{ filename: 'attachment', content: strAttachment }] : [],
    };
    await smtp.sendMail(mailOptions);
  }
}
module.exports = EmailService;
