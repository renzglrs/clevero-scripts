async function script(C) {
  // Get all relevant appointments
  const { entries: appointments } = await C.getEntries({
    filter: [
      [
        {
          subject: "id", // comment/remove this filter in production
          type: "number:recordValue",
          operator: "any_of",
          value: ["200940217"],
        },
        "and",
        {
          subject: "date", // Add: Set Date to Today (e.g. Nov 19, 2024) and On or before Today
          requestType: "i",
          type: "date",
          operator: "equals",
          ignoreCase: true,
          value: {
            relative: true,
            type: "TODAY",
          },
        },
        "and",
        {
          subject: "report",
          requestType: "i",
          type: "array",
          operator: "is_empty",
          ignoreCase: true,
        },
        "and",
        {
          subject: "appointment-status",
          requestType: "i",
          type: "array",
          operator: "any_of",
          ignoreCase: true,
          value: [1355210], // Child Seen
        },
        // "and",
        // [
        //     {
        //         subject: "report-blurb",
        //         requestType: "i",
        //         type: "text",
        //         operator: "not_empty",
        //         ignoreCase: true,
        //     },
        //     "or",
        //     {
        //         subject: "1188947-optical-report-blurb",
        //         requestType: "i",
        //         type: "text",
        //         operator: "not_empty",
        //         ignoreCase: true,
        //     },
        // ],
        "and",
        [
          {
            subject: "1188947-report-generated",
            requestType: "i",
            type: "checkbox",
            operator: "is_false",
            ignoreCase: true,
          },
          "or",
          {
            subject: "1188947-report-generated",
            requestType: "i",
            type: "checkbox",
            operator: "is_empty",
            ignoreCase: true,
          },
        ],
      ],
    ],
    limit: 1000,
    recordInternalId: "dental2you-patient-appointments",
  });

  C.addJsonToSummary(
    {
      appointments,
      length: appointments.length,
    },
    { enableCopy: true }
  );

  // return;

  // Loop through appointments asynchronously
  const updateResponse = await Promise.all(
    appointments.map(async (currentEntry) => {
      const entryId = currentEntry.recordValueId;
      const appointmentType = currentEntry["1188947-appointment-type"]?.[0];
      let result = {
        entryId,
        status: "Failed",
        message: "",
        entryDetails: currentEntry,
      }; // Include entryDetails for return
      const dateTimeNow = moment.tz("Australia/Brisbane").calendar();

      try {
        // Check if appointmentType is empty
        if (!appointmentType) {
          result.message = "Appointment type is missing.";
          C.addHtmlToSummary(
            `<h1 style='color: #fe6b6b; font-size: 14px;'>Report wasn't generated for entry ID ${entryId}: please fill in the appointment type before clicking the button again.</h1>`
          );
          return result;
        }

        // Templates mapping
        const templates = {
          200806219: {
            templateId: 1503832,
            type: "Dentist",
            blurbField: "report-blurb",
          },
          200806226: {
            templateId: 10016919,
            type: "Optometrist",
            blurbField: "1188947-optical-report-blurb",
          },
        };

        // Check if the appointment type exists in templates
        if (templates[appointmentType]) {
          const { templateId, type, blurbField } = templates[appointmentType];
          const reportBlurb = currentEntry[blurbField]?.[0];

          // Check if report blurb is empty
          if (!reportBlurb) {
            result.message = `${type} report blurb is missing.`;
            C.addHtmlToSummary(
              `<h1 style='color: #fe6b6b; font-size: 14px;'>Schedule Triggered: Report wasn't generated for entry ID ${entryId}: please fill in the ${type} report blurb before clicking the button again.</h1>`
            );
            await C.updateEntries({
              updates: [
                {
                  recordInternalId: "dental2you-patient-appointments",
                  entryId,
                  value: {
                    "1188947-report-automation-message": `Schedule Triggered: Please fill in the ${type} report blurb before clicking the button again. ${dateTimeNow}`,
                  },
                },
              ],
            });

            return result;
          }

          // Generate the report
          const report = await C.getPdfFromGoogleDocsTemplate({
            entryId,
            recordInternalId: "dental2you-patient-appointments",
            templateId,
            generatedFileDestinationField: "report",
            uuidFieldForPdfFile: "file-uuid",
          });

          // C.addJsonToSummary({ report: report });

          // Check if report was successfully generated
          if (report.uploadedPdf && report.uploadedPdf.name) {
            result.status = "Success";
            result.message = `${type} report generated successfully.`;
            result.reportName = report.uploadedPdf.name;

            // Update currentEntry with the report field
            currentEntry.report = [report.uploadedPdf]; // Add the generated report to currentEntry
            result.entryDetails = currentEntry; // Update result with the modified entry

            await C.updateEntries({
              updates: [
                {
                  recordInternalId: "dental2you-patient-appointments",
                  entryId,
                  value: {
                    "1188947-report-generated": true,
                  },
                },
              ],
            });

            C.addHtmlToSummary(
              `<h1 style='color: #20c997; font-size: 14px;'>${type} report successfully generated for entry ID ${entryId}.</h1>`
            );
          } else {
            result.message = `Failed to generate ${type} report.`;
            C.addHtmlToSummary(
              `<h1 style='color: #fe6b6b; font-size: 14px;'>Failed to generate ${type} report for entry ID ${entryId}.</h1>`
            );
          }
        } else {
          result.message = `No template found for appointment type ${appointmentType}.`;
          C.log(
            `No template found for appointment type ${appointmentType} in entry ID ${entryId}.`
          );
        }
      } catch (error) {
        result.message = `Error: ${error.message}`;
        C.log(`Error for entry ID ${currentEntry.id}: ${error.message}`);
        C.addHtmlToSummary(
          `<h1 style='color: #fe6b6b; font-size: 14px;'>Error processing entry ID ${currentEntry.id}: ${error.message}</h1>`
        );
      }

      return result;
    })
  );

  // Separate successful and failed entries
  const success = updateResponse.filter((entry) => entry.status === "Success");
  const failed = updateResponse.filter((entry) => entry.status === "Failed");

  // Return separated responses
  return {
    success,
    failed,
  };
}
