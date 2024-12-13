async function script(C) {
  const currentDate = moment();
  const lastDayOfMonth = currentDate.clone().endOf("month");
  const isLastDayOfMonth = currentDate.isSame(lastDayOfMonth, "day");
  // if(!isLastDayOfMonth)
  //     return { message: "Not end of the month. No report genererated." };

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
          subject: "date",
          requestType: "i",
          type: "datetime",
          operator: "within",
          ignoreCase: true,
          value: {
            from: {
              relative: true,
              value: null,
              type: { type: "START_OF", ref: "this_month" },
              // Custome date:
              // relative: false,
              // value: "2024-10-01"
            },
            to: {
              relative: true,
              value: null,
              type: { type: "END_OF", ref: "this_month" },
              // Custome date:
              // relative: false,
              // value: "2024-10-31"
            },
          },
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
      ],
    ],
    limit: 1000,
    // limit: 1,
    // ignoreLimits: true,
    // responseType: "iv",
    recordInternalId: "dental2you-patient-appointments",
  });

  C.addJsonToSummary(
    {
      visits,
      length: visits.length,
    },
    { enableCopy: true }
  );

  // return;

  // Count visits by centre
  const visitCountsByCentre = visits.reduce((acc, visit) => {
    const centre = visit.centre[0];
    if (centre) {
      acc[centre] = (acc[centre] || 0) + 1;
    }
    return acc;
  }, {});

  // Filter centres with 25 or more visits and store them in an array
  const filteredCentresIds = Object.keys(visitCountsByCentre).filter(
    (centre) => visitCountsByCentre[centre] >= 25
  );

  const { entries: filteredCentres } = await C.getEntries({
    filter: [
      {
        subject: "id",
        type: "number:recordValue",
        operator: "any_of",
        // value: filteredCentresIds,
        value: [1310042],
      },
    ],
    limit: 100,
    responseType: "iv",
    recordInternalId: "dental2you-locations",
  });

  const { entries: filteredCentresIOV } = await C.getEntries({
    filter: [
      {
        subject: "id",
        type: "number:recordValue",
        operator: "any_of",
        // value: filteredCentresIds,
        value: [1310042],
      },
    ],
    limit: 100,
    responseType: "iov",
    recordInternalId: "dental2you-locations",
  });

  C.addJsonToSummary(
    {
      visitCountsByCentre,
      filteredCentresIds,
      filteredCentres,
      filteredCentresIOV,
    },
    { enableCopy: true }
  );

  const { entries: allGifts } = await C.getEntries({
    filter: [],
    // sort: [{ field: "order", direction: "asc" }],
    // sortBy: "1",
    limit: 20, // Assume 11 gifts
    recordInternalId: "dental2you-gifts-list",
  });

  allGifts.sort((a, b) => {
    let startA = a["1188947-order"];
    let startB = b["1188947-order"];
    return startA - startB;
  });

  // C.addJsonToSummary({ allGifts });

  // Process each centre for "nextGift"
  const updatedCentres = await Promise.all(
    filteredCentresIOV.map(async (centre) => {
      const giftsAlreadySent = Array.isArray(centre["1188947-gifts-already-sent"])
        ? centre["1188947-gifts-already-sent"]
        : [];

      const nextGift =
        allGifts.find((gift) => !giftsAlreadySent.includes(gift.recordValueId)) || allGifts[0]; // Loop back to the first gift if all are sent

      if (!nextGift) {
        C.addJsonToSummary({ error: "No valid nextGift found." });
      }

      C.addJsonToSummary({
        nextGift,
        id: nextGift.recordValueId,
        giftsAlreadySent,
      });

      // const updatedGiftsAlreadySent = [
      //     ...new Set([...giftsAlreadySent, nextGift.recordValueId]),
      // ];

      const updatedGiftsAlreadySent = Array.from(
        new Set([...giftsAlreadySent, nextGift.recordValueId])
      );

      // Update "Gifts already sent" field
      await C.updateEntries({
        updates: [
          {
            entryId: centre.recordValueId,
            recordInternalId: "dental2you-locations",
            value: {
              "1188947-gifts-already-sent": updatedGiftsAlreadySent,
            },
          },
        ],
      });

      C.addJsonToSummary({
        centre: centre.name,
        nextGift: nextGift["1188947-name"],
        updatedGiftsAlreadySent,
      });

      return {
        ...centre,
        nextGift: nextGift["1188947-name"],
      };
    })
  );

  C.addJsonToSummary({
    updatedCentres,
    message: "Gifts have been updated for all centres.",
  });

  // return;

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
    Gift: "nextGift",
  };

  const hardcodedValues = {
    additionalLabelInfo1: "Dental visit - Gift",
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
    itemPackagingType: "AP_BOX_L",
    itemDeliveryService: "PP",
    itemDescription: "Dental visit - Gift",
    itemLength: "39",
    itemWidth: "28",
    itemHeight: "14",
    itemWeight: "1.7",
    itemDangerousGoodsFlag: "NO",
    signatureOnDelivery: "NO",
    extraCoverAmount: "",
  };

  const csvHeaders = Object.keys(headerMapping);

  // Updated mapVisitToCsv function to handle nested fields
  function mapVisitToCsv(visit) {
    C.addJsonToSummary({ VISIT: visit });
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
        if (header === "Deliver To Name") {
          value = `Director - ${value}`;
        }

        // If the value contains a comma, wrap it in quotes to prevent CSV issues
        if (typeof value === "string" && value.includes(",")) {
          value = `"${value}"`;
        }

        return value || "";
      })
      .join(",");
  }

  const csvData = [csvHeaders.join(",")]; // Initialize CSV with headers
  updatedCentres.forEach((visit) => {
    csvData.push(mapVisitToCsv(visit));
  }); // Add data rows

  // Create CSV file
  const month = moment().tz(companyTimeZone).format("MMMM");

  const [testFile] = await Promise.all([
    C.generateFile({
      filename: `${month} Gifts`,
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
    // to: ["larissa@dental2you.net"],
    to: ["renz@clevero.co"],
    // bcc: ["renz@clevero.co"],
    subject: `${month} Report: Gift CSV File`,
    body: `Here is your monthly generated CSV file for Centres that require a gift:\n`,
    attachments: [testFile],
    ...entryDetails,
  });

  C.addJsonToSummary({ sendEmailResponse });

  return;
}
