async function script(C) {
  try {
    let tenantId = (await C.getCompanySettings()).xeroOrganisation.xeroId;
    if (!tenantId) {
      throw "Default xero organisation is not set in company settings";
    }

    const xeroDataKeys = [
      "xero-tax-rates",
      "xero-branding-themes",
      "xero-currencies",
      "xero-line-amount-types-131-1596167634161",
      "xero-invoice-types-131-1596167577672",
      "xero-invoice-status-codes-131-1596167673522",
      "accounts",
    ];

    const xeroData = await Promise.all(
      xeroDataKeys.map((key) =>
        C.getEntries({
          recordInternalId: key,
          ignoreLimits: true,
          filter: [],
        })
      )
    );

    const brandingThemeID = xeroData[1]?.entries?.[0]?.["xero-id"];

    // Define filter for fetching visits
    const filter = [
      [
        {
          subject: "id",
          type: "number:recordValue",
          operator: "any_of",
          value: ["200857423"],
        },
        // "AND",
        // {
        //     subject: "start-time",
        //     requestType: "i",
        //     type: "datetime",
        //     operator: "within",
        //     ignoreCase: true,
        //     value: {
        //         from: {
        //             relative: true,
        //             value: null,
        //             type: { type: "START_OF", ref: "this_week" },
        //             // relative: false,
        //             // value: "2024-12-01",
        //         },
        //         to: {
        //             relative: true,
        //             value: null,
        //             type: { type: "END_OF", ref: "this_week" },
        //             // relative: false,
        //             // value: "2024-12-07",
        //         },
        //     },
        // },
        // "AND",
        // [
        //     {
        //         subject: "1188947-rctis-generated",
        //         requestType: "i",
        //         type: "checkbox",
        //         operator: "is_empty",
        //         ignoreCase: true,
        //     },
        //     "OR",
        //     {
        //         subject: "1188947-rctis-generated",
        //         requestType: "i",
        //         type: "checkbox",
        //         operator: "is_false",
        //         ignoreCase: true,
        //     },
        // ],
      ],
    ];

    // Fetch all visits within the specified time range
    const visits = await C.getEntries({
      filter,
      limit: 1,
      recordInternalId: "dental2you-appointments",
      loadAssociations: true,
      associations: [
        {
          internalId: "dental2you-patient-appointments",
          responseType: "iov",
        },
      ],
    });

    const visitEntries = visits.entries;

    C.addJsonToSummary(
      {
        visits,
        totalVisits: visitEntries.length,
      },
      {
        enableCopy: true,
      }
    );

    // return;

    const results = [];
    const supplierBillValues = [];
    const supplierValues = [];

    for (const entry of visitEntries) {
      try {
        const entryId = entry.recordValueId;
        const practitionerId = entry.dentist?.[0];
        if (!practitionerId) {
          throw new Error("No Practitioner found");
        }
        let name = entry.name;
        let reference1 = `${entry.autoId}-${name}`;

        // Fetch practitioner details
        const practitionerObject = await C.getEntry({
          entryId: practitionerId,
          recordInternalId: "employees",
        });
        if (!practitionerObject) {
          throw new Error("Practitioner details could not be fetched");
        }
        const practitionerName = `${practitionerObject["first-name"]} ${practitionerObject["last-name"]}`;

        // Check if there is a linked supplier record
        if (
          !practitionerObject["1188947-linked-supplier"] ||
          practitionerObject["1188947-linked-supplier"].length === 0
        ) {
          C.log("No Supplier record found. Creating...");

          // Create Supplier
          supplierValues.push({
            name: practitionerObject.name,
            email: practitionerObject.email,
          });

          const supplierEntryCreated = await C.createEntries({
            values: supplierValues,
            recordInternalId: "xero-suppliers",
            options: {
              returnRecordInfo: true,
              makeAutoId: true,
            },
          });

          if (supplierEntryCreated) {
            // Store supplier id to employee
            const updatedPractioner = await C.updateEntries({
              updates: [
                {
                  recordInternalId: "employees",
                  entryId: practitionerId,
                  value: {
                    "1188947-linked-supplier": [supplierEntryCreated.success[0].id],
                  },
                },
              ],
            });

            C.addJsonToSummary({
              message: "Supplier Created Succeffully",
              updatedPractioner,
            });
          }
        }

        // Create Supplier Bill
        supplierBillValues.push({
          supplier: entry.dentist,
          date: moment().format("YYYY-MM-DD"),
          "due-date": moment().format("YYYY-MM-DD"),
          reference: reference1,
          "xero-status": [34126],
          currency: [713002],
        });

        const supplierBillEntryCreated = await C.createEntries({
          values: supplierBillValues,
          recordInternalId: "supplier-bills",
          options: {
            returnRecordInfo: true,
            makeAutoId: true,
          },
        });

        let supplierBillEntryCreatedId = supplierBillEntryCreated.success[0].id;

        // Create orderline values
        const appointments = entry.associations?.["dental2you-patient-appointments"] || [];
        const completedAppointments = appointments.filter(
          (appt) => appt["appointment-status"]?.[0] === 1355210
        );
        if (completedAppointments.length === 0) {
          throw new Error("No completed appointments found");
        }

        const orderLineValues = [
          {
            description: "Appointment",
            quantity: completedAppointments.length,
            account: [1905109], // Example account ID
            "tax-rate": [781013], // Example tax rate ID
            tax: 0,
            parent: supplierBillId,
            index: 1,
          },
        ];

        await C.createEntries({
          values: orderLineValues,
          recordInternalId: "xero-order-items",
          options: { returnRecordInfo: true, makeAutoId: true },
        });

        results.push({
          entryId: entry.recordValueId,
          status: "Success",
          message: "Processed successfully",
          practitionerName,
        });
      } catch (error) {
        results.push({
          entryId: entry.recordValueId,
          status: "Error",
          message: error.message,
        });
      }
    }

    // Summarize results
    const successResults = results.filter((res) => res.status === "Success");
    const errorResults = results.filter((res) => res.status === "Error");

    C.addJsonToSummary(
      {
        processedResults: results,
        summary: {
          total: visitEntries.length,
          success: successResults,
          errors: errorResults,
        },
      },
      { enableCopy: true }
    );
  } catch (error) {
    C.addJsonToSummary({ error: error.message }, { enableCopy: true });
    throw error;
  }
}
