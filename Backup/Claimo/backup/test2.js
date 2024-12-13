async function script(C) {
  try {
    function formatPhoneNumber(phoneNumber) {
      if (phoneNumber.startsWith("04")) {
        return phoneNumber.replace(/^04/, "+614");
      } else if (phoneNumber.startsWith("4")) {
        return phoneNumber.replace(/^4/, "+614");
      }
      return phoneNumber;
    }

    const filter = [
      {
        subject: "id",
        type: "number:recordValue",
        operator: "any_of",
        value: ["301385304"],
      },
      "and",
      {
        subject: "lead-status",
        requestType: "i",
        type: "array",
        operator: "any_of",
        ignoreCase: true,
        value: [823222],
      },
      "and",
      {
        subject: "created-date",
        requestType: "i",
        type: "date",
        operator: "on_or_after",
        ignoreCase: true,
        value: {
          relative: false,
          value: "2024-11-01",
        },
      },
      "and",
      {
        subject: "linked-client",
        requestType: "i",
        type: "array",
        operator: "is_empty",
        ignoreCase: true,
      },
      "and",
      [
        {
          subject: "25254-duplicate-lead",
          requestType: "i",
          type: "checkbox",
          operator: "is_false",
          ignoreCase: true,
        },
        "or",
        {
          subject: "25254-duplicate-lead",
          requestType: "i",
          type: "checkbox",
          operator: "is_empty",
          ignoreCase: true,
        },
      ],
      "and",
      [
        {
          subject: "25254-reminder-loa-sms-sent",
          requestType: "i",
          type: "checkbox",
          operator: "is_false",
          ignoreCase: true,
        },
        "or",
        {
          subject: "25254-reminder-loa-sms-sent",
          requestType: "i",
          type: "checkbox",
          operator: "is_empty",
          ignoreCase: true,
        },
      ],
      "and",
      [
        {
          subject: "25254-resend-loa-email-sent",
          requestType: "i",
          type: "checkbox",
          operator: "is_false",
          ignoreCase: true,
        },
        "or",
        {
          subject: "25254-resend-loa-email-sent",
          requestType: "i",
          type: "checkbox",
          operator: "is_empty",
          ignoreCase: true,
        },
      ],
    ];

    const filteredLeads = await C.filterEntries({
      filter,
      limit: 1,
      // ignoreLimits: true,
      recordInternalId: "claimo-leads",
    });

    if (!filteredLeads.entries || filteredLeads.entries.length === 0) {
      return "No Leads found.";
    }

    const entries = filteredLeads.entries;

    C.addJsonToSummary({ filteredLeads });
    return;

    // Array to collect updates
    const updates = [];

    async function sendSMS(phone, name, entryId, uniqueIdentifier) {
      try {
        let specialLink = `https://app.claimo.com.au/${uniqueIdentifier}`;
        const smsBody = `Hi ${name}, this is a friendly follow-up on your refund claim for add-on insurance. Please check your email (including spam) as we're waiting for your response to proceed. You can also access your profile and application here: ${specialLink}. Need help? Call 1300 879 071 to speak with a specialist. Thanks - Claimo (Do not reply; SMS not monitored).`;
        const smsData = {
          from: "Claimo", // Claimo
          to: phone,
          message: smsBody,
        };

        const res = await axios.post("https://api.tallbob.com/v2/sms/send", smsData, {
          auth: {
            username: "d01d9a68-0203-11ef-b45e-e51fac1bf524",
            password: "7a911ce4036018a20a3350e585d1fd2ae6465101bdbad2dca1aeee60f4867082",
          },
        });

        if (res.data) {
          C.log(`SMS sent to ${name} (${phone}). Entry ID: ${entryId}`);
          await C.addRelationship({
            messageData: {
              to: res.data.to,
              body: res.data.message,
              messageId: res.data.sms_id,
            },
            type: "sms",
            linkedEntries: [
              {
                recordId: 812229,
                entryId,
              },
            ],
            options: {
              logMessageToCurrentEntry: true,
            },
          });
          return true;
        }
      } catch (error) {
        C.log(`Error sending SMS to ${name} (${phone}): ${error.message}`);
        return false;
      }
    }

    async function sendEmail(email, name, entryId) {
      try {
        const emailData = {
          entryId,
          recordInternalId: "claimo-leads",
          from: {
            email: "hello@claimo.com.au",
            name: "Claimo",
          },
          to: [email],
          templateId: 10019095,
          logEmail: [
            {
              recordId: 812229,
              entryId,
            },
          ],
        };

        await C.sendEmail(emailData);
        C.log(`Email sent to ${name} (${email}). Entry ID: ${entryId}`);
        return true;
      } catch (error) {
        C.log(`Error sending email to ${name} (${email}): ${error.message}`);
        return false;
      }
    }

    // Process entries and collect updates
    await Promise.all(
      entries.map(async (entry) => {
        const {
          recordValueId,
          "first-name": leadFirstName,
          email: leadEmail,
          phone,
          "unique-identifier": uniqueIdentifier,
        } = entry;
        const leadPhone = formatPhoneNumber(phone);

        try {
          const [smsSent, emailSent] = await Promise.all([
            leadPhone
              ? sendSMS(leadPhone, leadFirstName, recordValueId, uniqueIdentifier)
              : Promise.resolve(false),
            leadEmail ? sendEmail(leadEmail, leadFirstName, recordValueId) : Promise.resolve(false),
          ]);
          C.log(`Both SMS and email processed. Entry ID: ${recordValueId}`);

          // Collect updates
          const updateFields = {};
          if (smsSent) {
            updateFields["25254-reminder-loa-sms-sent"] = true;
          }
          if (emailSent) {
            updateFields["25254-resend-loa-email-sent"] = true;
          }

          if (Object.keys(updateFields).length > 0) {
            updates.push({
              entryId: recordValueId,
              recordInternalId: "claimo-leads",
              value: updateFields,
            });
          } else {
            C.log(`No fields to update for entry ID: ${recordValueId}`);
          }
        } catch (error) {
          C.log("An error occurred:", error);
        }
      })
    );

    // Perform batch update
    if (updates.length > 0) {
      C.addJsonToSummary(updates);
      await C.updateEntries({ updates });
      C.log(`Batch update completed for ${updates.length} entries.`);
    } else {
      C.log("No updates to process.");
    }

    C.addJsonToSummary({ updates });
  } catch (error) {
    C.log(`Error in script: ${error.message}`);
    C.addJsonToSummary({
      error: error.message,
      stack: error.stack,
    });
  }
}
