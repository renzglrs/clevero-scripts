async function script(C) {
  const scriptValue = await C.getScriptReturnValue("aa8YFatYVY2-Am856VRh6");
  const entries = scriptValue.success;
  // For checking
  // C.addJsonToSummary({
  //     scriptValue,
  //     entries,
  // });

  // Process each entry and send email updates
  const updateResponses = await Promise.all(
    entries.map(async (entry) => {
      const currentEntry = entry.entryDetails;
      const patientId = currentEntry.patient[0];
      const dateTimeNow = moment.tz("Australia/Brisbane").calendar();

      C.addJsonToSummary({
        currentEntry,
        patientId,
      });

      // return;

      // Retrieve patient details
      const patientObject = await C.getEntry({
        entryId: patientId,
        recordInternalId: "dental2you-patients",
      });

      // Hardcoded email for testing purposes, replace with patientObject.email in production
      const patientEmail = patientObject.email;
      // const patientEmail = "renz@clevero.co";
      // Parse report if it's a string representation of an array or object
      let attachments = [];
      if (typeof currentEntry.report === "string") {
        try {
          attachments = JSON.parse(currentEntry.report);
        } catch (parseError) {
          C.addJsonToSummary({
            message: "Schedule Trigger: Invalid report format. Could not parse as JSON.",
            parseError,
          });
          return;
        }
      } else {
        attachments = currentEntry.report || [];
      }
      const appointmentType = currentEntry["1188947-appointment-type"];
      const reportBlurb = currentEntry["report-blurb"];
      const opticalReportBlurb = currentEntry["1188947-optical-report-blurb"];

      // Validation messages
      let errorMessage = "";
      let isError = false;
      if (!patientEmail) {
        isError = true;
        errorMessage = "Schedule Trigger: Report wasn't sent, no patients email found.";
      } else if (!appointmentType || appointmentType.length === 0) {
        isError = true;
        errorMessage = "Schedule Trigger: Report wasn't sent, appointment type is not set.";
      } else if (attachments.length === 0) {
        isError = true;
        errorMessage = "Schedule Trigger: Report wasn't sent, no attachments found.";
      } else if (appointmentType[0] === 200806226 && !opticalReportBlurb) {
        `Schedule Trigger: Report wasn't sent, report blurb is empty`;
      } else if (appointmentType[0] === 200806219 && !reportBlurb) {
        `Schedule Trigger: Report wasn't sent, report blurb is empty`;
      }

      if (errorMessage) {
        C.addHtmlToSummary(`<h1 style='color: #fe6b6b; font-size: 14px;'>${errorMessage}</h1>`);

        await C.updateEntries({
          updates: [
            {
              recordInternalId: "dental2you-patient-appointments",
              entryId: currentEntry.recordValueId,
              value: {
                "1188947-report-automation-message": errorMessage,
              },
            },
          ],
        });
        return; // Early return if validation fails
      }

      // Set email template based on appointment type
      let emailTemplateId;
      switch (appointmentType[0]) {
        case 200806219:
          emailTemplateId = 1355317;
          break;
        case 200806226:
          emailTemplateId = 10016924;
          break;
        default:
          throw new Error("Unsupported appointment type");
      }

      const emailInput = {
        entryId: currentEntry.recordValueId,
        recordInternalId: "dental2you-patient-appointments",
        from: { email: "admin@dental2you.net", name: "Dental 2 You" },
        to: [patientEmail],
        logEmail: [
          {
            recordId: 1198026,
            entryId: currentEntry.recordValueId,
          },
        ],
        attachments,
        templateId: emailTemplateId,
      };

      const emailResponse = await C.sendEmail(emailInput);
      C.addJsonToSummary({ emailResponse });

      if (!emailResponse) {
        C.addHtmlToSummary(
          "<h1 style='color: #fe6b6b; font-size: 14px;'>Failed report sending!</h1>"
        );
        return;
      }

      C.addHtmlToSummary(
        `<h1 style='color: #20c997; font-size: 14px;'>Report successfully sent to ${patientEmail} ${dateTimeNow}.</h1>`
      );

      if (!isError) {
        errorMessage = `Report generated and Email sent successfully ${dateTimeNow}`;
      }
      return C.updateEntries({
        updates: [
          {
            recordInternalId: "dental2you-patient-appointments",
            entryId: currentEntry.recordValueId,
            value: {
              "report-sent": true,
              "1188947-report-automation-message": errorMessage,
            },
          },
        ],
      });
    })
  );

  return updateResponses; // Return update responses if needed for further processing
}
