async function script(C) {
  const entryDetails = {
    entryId: 10010862,
    recordInternalId: "employees",
  };

  const { timezone: companyTimeZone = "Australia/Sydney" } = await C.getCompanySettings();

  // Get all relevant visits that fall between the start and end date
  const { entries: visits } = await C.getEntries({
    filter: [
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
              type: { type: "START_OF", ref: "this_month" },
            },
            to: {
              relative: true,
              value: null,
              type: { type: "END_OF", ref: "this_month" },
            },
          },
        },
      ],
    ],
    limit: 5000,
    recordInternalId: "dental2you-appointments",
  });

  // Group visits by centre
  const visitsGroupedByCentre = visits.reduce((acc, visit) => {
    const centre = Array.isArray(visit.centre) ? visit.centre[0] : visit.centre; // Adjust if `centre` is not an array
    if (centre) {
      if (!acc[centre]) {
        acc[centre] = [];
      }
      acc[centre].push(visit);
    }
    return acc;
  }, {});

  // Add the grouped visits to the summary
  C.addJsonToSummary(
    {
      visitsGroupedByCentre,
      totalVisits: visits.length,
    },
    { enableCopy: true }
  );

  // Get unique centre IDs
  const filteredCentresIds = [...new Set(Object.keys(visitsGroupedByCentre))];

  // Retrieve additional information for filtered centres

  const { entries: filteredCentres } = await C.getEntries({
    filter: [
      {
        subject: "id",
        type: "number:recordValue",
        operator: "any_of",
        value: filteredCentresIds,
      },
    ],
    limit: 1000,
    responseType: "iv",
    recordInternalId: "dental2you-locations",
  });

  // Add filtered centre details to the summary
  C.addJsonToSummary(
    {
      filteredCentresIds,
      filteredCentres,
    },
    { enableCopy: true }
  );

  const headerMapping = {
    "Additional Label Information 1": "additionalLabelInfo1",
    "Send Tracking Notifications": "sendTrackingNotifications",
    "Send From Name": "sendFromName",
    "Send From Business Name": "sendFromBusinessName",
    "Send From Address Line 1": "sendFromAddressLine1",
    "Send From Address Line 2": "sendFromAddressLine2",
    "Send From Address Line 3": "sendFromAddressLine3",
    "Send From Suburb": "sendFromSuburb",
    "Send From State": "sendFromState",
    "Send From Postcode": "sendFromPostcode",
    "Send From Phone Number": "sendFromPhoneNumber",
    "Send From Email Address": "sendFromEmailAddress",
    "Deliver To Name": "primary-contact",
    "Deliver To MyPost Number": "deliverToMyPostNumber",
    "Deliver To Business Name": "name",
    "Deliver To Type Of Address": "deliverToTypeOfAddress",
    "Deliver To Address Line 1": "1188947-street",
    "Deliver To Address Line 2": "deliverToAddressLine2",
    "Deliver To Address Line 3": "deliverToAddressLine3",
    "Deliver To Suburb": "1188947-suburb",
    "Deliver To State": "1188947-state",
    "Deliver To Postcode": "1188947-postcode",
    "Deliver To Phone Number": "phone",
    "Deliver To Email Address": "email",
    "Item Packaging Type": "itemPackagingType",
    "Item Delivery Service": "itemDeliveryService",
    "Item Description": "itemDescription",
    "Item Length": "itemLength",
    "Item Width": "itemWidth",
    "Item Height": "itemHeight",
    "Item Weight": "itemWeight",
    "Item Dangerous Goods Flag": "itemDangerousGoodsFlag",
    "Signature On Delivery": "signatureOnDelivery",
    "Extra Cover Amount": "extraCoverAmount",
    "Next 2 Dental Visits": "nextDentalVisits",
    "Next 1 Optical Visit": "nextOpticalVisit",
    ABN: "abn",
  };

  const hardcodedValues = {
    additionalLabelInfo1: "Promotional Material - Dental Visit",
    sendTrackingNotifications: "YES",
    sendFromName: "Dental2you",
    sendFromBusinessName: "Dental2you Pty Ltd",
    sendFromAddressLine1: "HOMEMAKERS PLAZA",
    sendFromAddressLine2: "U 6 9-11 LAWRENCE DR",
    sendFromAddressLine3: "",
    sendFromSuburb: "NERANG",
    sendFromState: "QLD",
    sendFromPostcode: "4211",
    sendFromPhoneNumber: "0478883830",
    sendFromEmailAddress: "admin@dental2you.net",
    deliverToMyPostNumber: "",
    deliverToTypeOfAddress: "STANDARD_ADDRESS",
    deliverToAddressLine2: "",
    deliverToAddressLine3: "",
    itemPackagingType: "OWN_PACKAGING",
    itemDeliveryService: "Express Post",
    itemDescription: "Promotional Material",
    itemLength: "65cm",
    itemWidth: "50cm",
    itemHeight: "3.5cm",
    itemWeight: "1.45",
    itemDangerousGoodsFlag: "NO",
    signatureOnDelivery: "NO",
    extraCoverAmount: "",
  };

  const csvHeaders = Object.keys(headerMapping);
  C.addJsonToSummary({ csvHeaders }, { enableCopy: true });

  // Updated mapVisitToCsv function to handle nested fields
  function mapVisitToCsv(visit) {
    return csvHeaders
      .map((header) => {
        const key = headerMapping[header];
        let value;

        // Check if the key is for a nested field
        if (key.includes(".")) {
          const keys = key.split(".");
          value = visit;
          keys.forEach((k) => {
            value = value ? value[k] : ""; // Navigate through the nested structure
          });
        } else {
          value = hardcodedValues[key] || visit[key] || "";
        }

        // If the field is "Deliver To Name", prepend "Director-"
        // if (header === "Deliver To Name") {
        //     value = `Director - ${value}`;
        // }

        // If the value contains a comma, wrap it in quotes to prevent CSV issues
        if (typeof value === "string" && value.includes(",")) {
          value = `"${value}"`;
        }

        return value || "";
      })
      .join(",");
  }

  const csvData = [csvHeaders.join(",")]; // Initialize CSV with headers
  filteredCentres.forEach((visit) => {
    csvData.push(mapVisitToCsv(visit));
  }); // Add data rows

  // Create CSV file
  const month = moment().tz(companyTimeZone).format("MMMM");

  const [testFile] = await Promise.all([
    C.generateFile({
      filename: `${month} Centres`,
      extension: "csv",
      contentType: "text/csv",
      content: csvData.join("\n"),
    }),
  ]);

  // Send email with attachment and dynamic body
  const sendEmailResponse = await C.sendEmail({
    from: {
      email: "notifications@mailvero.com",
      name: "Clevero Notification Service",
    },
    to: ["renz@clevero.co"],
    subject: `TEST: ${month} Centres CSV File`,
    body: `TEST: Here is your monthly generated CSV file for Centres:\n`,
    attachments: [testFile],
    ...entryDetails,
  });
  C.addJsonToSummary({ sendEmailResponse });

  return;
}
