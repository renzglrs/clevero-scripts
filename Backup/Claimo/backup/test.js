async function script(C) {
  try {
    // Fetch company settings and set timezone (future use if needed)
    const { timezone: companyTimeZone = "Australia/Sydney" } = await C.getCompanySettings();

    // Function to check if number starts with "04" or "4"
    function formatPhoneNumber(phoneNumber) {
      // Check if the phone number starts with "04"
      if (phoneNumber.startsWith("04")) {
        // Replace "04" with "+614"
        return phoneNumber.replace(/^04/, "+614");
      }
      // Check if the phone number starts with "4"
      else if (phoneNumber.startsWith("4")) {
        // Replace "4" with "+614"
        return phoneNumber.replace(/^4/, "+614");
      }
      // Return the original phone number if no changes are needed
      return phoneNumber;
    }

    // Define filter for leads
    const filter = [
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
          value: "2024-11-01", // Static date;
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

    // Filter entries using the defined filter
    const filteredLeads = await C.filterEntries({
      filter,
      limit: 10,
      // ignoreLimits: true,
      recordInternalId: "claimo-leads",
    });

    // Early return when no leads found
    if (!filteredLeads.entries && filteredLeads.entries.length === 0) return "No Leads found.";

    // Add results to summary
    C.addJsonToSummary({
      message: "Filtered leads retrieved successfully.",
      count: filteredLeads.entries.length,
      filteredLeads,
    });

    return;

    const entries = filteredLeads.entries;
    const updateResponse = await Promise.all(
      entries.map(async (entry) => {
        // Constants
        const currentEntry = entry;
        const entryId = currentEntry.recordValueId;
        const leadFirstName = currentEntry["first-name"];
        const leadEmail = currentEntry.email;
        const leadPhone = formatPhoneNumber(currentEntry.phone);

        let baseUrl = "https://api.tallbob.com/v2/sms/send";
        let from = "61437023076"; //61437023076 // Claimo
        let specialLink = "";
        let smsBody = `Hi ${leadFirstName}, this is a friendly follow up on your refund claim for add-on insurance. Please check your email (including spam) as we're waiting for your response to proceed. You can also access your profile and application here: ${specialLink}. Need help? Call 1300 879 071 to speak with a specialist. Thanks - Claimo (Do not reply; SMS not monitored).`;

        if (leadPhone) {
          C.log(`Phone number found. Sending to ${leadFirstName}; Entry ID: ${entryId}`);

          let data = {
            from: from,
            to: leadPhone,
            to: "639175446351",
            message: message,
          };

          // Tallbob
          // let res = await axios.post(baseUrl, data, {
          //     auth: {
          //         username: "d01d9a68-0203-11ef-b45e-e51fac1bf524",
          //         password:
          //             "7a911ce4036018a20a3350e585d1fd2ae6465101bdbad2dca1aeee60f4867082",
          //     },
          // });
        } else {
          C.log(`No phone found for Lead: ${leadFirstName}; Entry ID: ${entryId}`);
        }

        return {
          currentEntry,
          entryId,
          leadEmail,
          leadPhone,
        };
      })
    );

    C.addJsonToSummary({ updateResponse });
  } catch (error) {
    // Log error details for debugging
    C.log(`Error in script: ${error.message}`);
    C.addJsonToSummary({
      error: error.message,
      stack: error.stack,
    });
  }
}
