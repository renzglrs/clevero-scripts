async function script(C) {
  try {
    // Initialize and validate tenant ID
    const tenantId = await getTenantId(C);
    if (!tenantId) {
      throw new Error("Default Xero organisation is not set in company settings");
    }

    // Fetch required data from Xero
    const xeroData = await fetchXeroData(C);

    // Fetch visits data based on filter
    const visits = await fetchVisits(C);
    C.addJsonToSummary({ visits, totalVisits: visits.entries.length }, { enableCopy: true });

    // Process each visit and generate supplier bills
    const results = [];
    const supplierBillValues = [];
    for (const entry of visits.entries) {
      try {
        const processedEntry = await processVisitEntry({ C, entry });
        C.addJsonToSummary({ processedEntry });
        supplierBillValues.push(processedEntry.supplierBill);

        results.push({
          processedEntry,
          entryId: processedEntry.entryId,
          status: "Success",
          message: "This entry was processed successfully.",
          ...processedEntry.details,
        });
      } catch (error) {
        results.push({
          entryId: entry.recordValueId,
          status: "Error",
          message: error.message,
        });
      }
    }

    C.addJsonToSummary({ supplierBillValues });

    // Create supplier bills in bulk if any are generated
    if (supplierBillValues.length > 0) {
      const createResponse = await createSupplierBills({
        C,
        supplierBillValues,
      });
      const summary = summarizeResults({ results, totalVisits: visits.entries.length });
      C.addJsonToSummary(
        { processedResults: results, summary, createResponse },
        { enableCopy: true }
      );
    }
  } catch (error) {
    C.addJsonToSummary({ error: error.message }, { enableCopy: true });
    throw error;
  }
}

// Helper functions
async function getTenantId(C) {
  const companySettings = await C.getCompanySettings();
  return companySettings.xeroOrganisation?.xeroId;
}

async function fetchXeroData(C) {
  const recordIds = [
    "xero-tax-rates",
    "xero-branding-themes",
    "xero-currencies",
    "xero-line-amount-types-131-1596167634161",
    "xero-invoice-types-131-1596167577672",
    "xero-invoice-status-codes-131-1596167673522",
    "accounts",
  ];
  const promises = recordIds.map((id) =>
    C.getEntries({ recordInternalId: id, ignoreLimits: true, filter: [] })
  );
  return await Promise.all(promises);
}

async function fetchVisits(C) {
  const filter = [
    [
      {
        subject: "start-time",
        requestType: "i",
        type: "datetime",
        operator: "within",
        ignoreCase: true,
        value: {
          from: {
            relative: true,
            value: null,
            type: { type: "START_OF", ref: "this_week" },
          },
          to: {
            relative: true,
            value: null,
            type: { type: "END_OF", ref: "this_week" },
          },
        },
      },
      "and",
      [
        {
          subject: "1188947-rctis-generated",
          requestType: "i",
          type: "checkbox",
          operator: "is_empty",
          ignoreCase: true,
        },
        "or",
        {
          subject: "1188947-rctis-generated",
          requestType: "i",
          type: "checkbox",
          operator: "is_false",
          ignoreCase: true,
        },
      ],
    ],
  ];

  return await C.getEntries({
    filter,
    limit: 2,
    recordInternalId: "dental2you-appointments",
    loadAssociations: true,
    associations: [
      {
        internalId: "dental2you-patient-appointments",
        responseType: "iov",
      },
    ],
  });
}

async function processVisitEntry(data) {
  const C = data.C;
  const entry = data.entry;

  const practitionerId = entry.dentist?.[0];
  if (!practitionerId) throw new Error("No Practitioner found");

  const practitioner = await C.getEntry({
    entryId: practitionerId,
    recordInternalId: "employees",
  });
  if (!practitioner) throw new Error("Practitioner details could not be fetched");

  const practitionerName = `${practitioner["first-name"]} ${practitioner["last-name"]}`;
  const completedAppointments = (
    entry.associations?.["dental2you-patient-appointments"] || []
  ).filter((appt) => appt["appointment-status"]?.[0] === 1355210);
  if (completedAppointments.length === 0) throw new Error("No completed appointments found");

  const reference = `${entry.autoId}-${entry.name}`;
  const supplierBill = {
    supplier: entry.dentist,
    date: moment().format("YYYY-MM-DD"),
    "due-date": moment().format("YYYY-MM-DD"),
    reference,
    "xero-status": [34126],
    currency: [713002],
  };

  return {
    entryId: entry.recordValueId,
    supplierBill,
    details: {
      practitionerName,
      completedAppointments: completedAppointments.length,
    },
  };
}

async function createSupplierBills(data) {
  return await data.C.createEntries({
    values: data.supplierBillValues,
    recordInternalId: "supplier-bills",
    options: { returnRecordInfo: true, makeAutoId: true },
  });
}

function summarizeResults(data) {
  const success = data.results.filter((res) => res.status === "Success");
  const errors = data.results.filter((res) => res.status === "Error");
  return {
    total: data.totalVisits,
    success: success.length,
    errors: errors.length,
  };
}
