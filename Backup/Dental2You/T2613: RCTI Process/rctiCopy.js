async function script(C) {
  // Get the Xero organization ID from the company's settings
  let tenantId = (await C.getCompanySettings()).xeroOrganisation.xeroId;
  if (!tenantId) {
    throw "Default xero organisation is not set in company settings"; // Error if no Xero organization ID
  }

  // Retrieve various Xero configurations in parallel (tax rates, branding themes, etc.)
  let [
    xeroTaxRates,
    xeroBrandingThemes,
    xeroCurrencies,
    xeroLineAmountTypes,
    xeroInvoiceTypes,
    xeroInvoiceStatusCodes,
    xeroAccounts,
  ] = await Promise.all([
    C.getEntries({ recordInternalId: "xero-tax-rates", ignoreLimits: true, filter: [] }),
    C.getEntries({ recordInternalId: "xero-branding-themes", ignoreLimits: true, filter: [] }),
    C.getEntries({ recordInternalId: "xero-currencies", ignoreLimits: true, filter: [] }),
    C.getEntries({
      recordInternalId: "xero-line-amount-types-131-1596167634161",
      ignoreLimits: true,
      filter: [],
    }),
    C.getEntries({
      recordInternalId: "xero-invoice-types-131-1596167577672",
      ignoreLimits: true,
      filter: [],
    }),
    C.getEntries({
      recordInternalId: "xero-invoice-status-codes-131-1596167673522",
      ignoreLimits: true,
      filter: [],
    }),
    C.getEntries({ recordInternalId: "accounts", ignoreLimits: true, filter: [] }),
  ]);

  // Set branding theme ID if available
  let brandingThemeID = xeroBrandingThemes.entries[0]
    ? xeroBrandingThemes.entries[0]["xero-id"]
    : undefined;

  // Filter audits with specific statuses, start dates, and checkbox criteria
  const filteredAudit = await C.filterEntries({
    filter: [
      {
        subject: "status",
        requestType: "i",
        type: "array",
        operator: "any_of",
        value: [1211295, 1796802, 1211291, 1211294, 1211290],
      },
      "and",
      {
        subject: "scheduled-start",
        requestType: "i",
        type: "date",
        operator: "after",
        ignoreCase: true,
        value: { relative: false, value: "2023-06-30" },
      },
      "and",
      [
        {
          subject: "rctis-generated",
          requestType: "i",
          type: "checkbox",
          operator: "is_empty",
          ignoreCase: true,
        },
        "or",
        {
          subject: "rctis-generated",
          requestType: "i",
          type: "checkbox",
          operator: "is_false",
          ignoreCase: true,
        },
      ],
    ],
    limit: 1000,
    recordInternalId: "awg-audits",
  });

  C.log(filteredAudit.entries.length); // Log the count of filtered audits

  if (filteredAudit.entries && !filteredAudit.entries.length > 0) return true; // Exit if no audits found

  // Iterate over each audit entry
  for (let k = 0; k < filteredAudit.entries.length; k++) {
    let currentEntry = filteredAudit.entries[k];

    // Get associated role assignments for the audit
    let associatedRoleAssignment = await C.getAssociations(
      [currentEntry.recordValueId],
      "awg-audits",
      ["awg-role-assignments"]
    );

    // Continue if there are no role assignments
    if (
      associatedRoleAssignment[`${currentEntry.recordValueId}`]["awg-role-assignments"] &&
      !associatedRoleAssignment[`${currentEntry.recordValueId}`]["awg-role-assignments"].length > 0
    )
      continue;

    // Filter associated role assignments based on specific conditions
    let filteredAssociatedEntries = _.filter(
      associatedRoleAssignment[`${currentEntry.recordValueId}`]["awg-role-assignments"],
      function (o) {
        let foundField = o.hasOwnProperty("648800-linked-supplier-bill");
        let contractFee = o["contract-fee"];
        let roleStatus = o.status[0];
        return (
          roleStatus == 714478 &&
          contractFee > 0 &&
          (foundField == false ||
            (o["648800-linked-supplier-bill"] && o["648800-linked-supplier-bill"].length == 0))
        );
      }
    );

    // Log information about generated supplier bills
    C.addListsToSummary([
      {
        value: `Generating supplier bills for audit Id: ${currentEntry.recordValueId}`,
        valueColor: "#220010",
        iconColor: "#220010",
        icon: "fa-duotone fa-check",
      },
    ]);

    // Process each filtered associated entry for supplier bill creation
    for (let i = 0; i < filteredAssociatedEntries.length; i++) {
      let orderLineValues = [];
      let supplierValues = [];
      let currentEntryData = filteredAssociatedEntries[i];

      const travelAllowanceAmount = +currentEntryData["648800-travel-allowance"] || 0;

      if (currentEntryData.assignee && currentEntryData.assignee.length < 1) return; // Exit if no assignee

      // Fetch linked records for the current entry
      let assigneeData = currentEntryData.assignee[0];
      let roleType = currentEntryData["role-type"][0];
      let linkedAudit = currentEntryData.audit[0];
      let linkedAuditDetails = await C.getEntry({
        recordInternalId: "awg-audits",
        entryId: linkedAudit,
        responseType: "iv",
      });

      let assigneeInternalData = await C.getEntry({
        recordInternalId: "awg-audit-team-members",
        entryId: assigneeData,
      });

      let roleTypeInternalData = await C.getEntry({
        recordInternalId: "awg-audit-roles",
        entryId: roleType,
      });

      // Generate reference and prepare supplier values for bill creation
      let name = currentEntryData.name;
      let reference1 = `${currentEntryData.autoId}-${name}-${roleTypeInternalData.name}`;

      let taxAmount = currentEntryData["tax-amount"] ? currentEntryData["tax-amount"] : 0;
      let supperAnnuation = currentEntryData.superannuation ? currentEntryData.superannuation : 0;
      let contractFee = currentEntryData["contract-fee"];

      supplierValues.push({
        "648800-audit-team-member": currentEntryData.assignee,
        date: moment().format("YYYY-MM-DD"),
        "due-date": moment().format("YYYY-MM-DD"),
        reference: reference1,
        "xero-status": [34126],
        currency: [713002],
      });

      // Create supplier bill entry
      let supplierEntryCreated = await C.createEntries({
        values: supplierValues,
        recordInternalId: "supplier-bills",
        options: { returnRecordInfo: true, makeAutoId: true },
      });

      let supplierEntryCreatedId = supplierEntryCreated.success[0].id;
      C.addHtmlToSummary(
        "Supplier Bill Created Id: <a href='https://app.clevero.co/app/records/1710998/view/" +
          supplierEntryCreatedId +
          "'>" +
          supplierEntryCreatedId +
          "</a>"
      );

      // Determine order line item values based on tax and superannuation status
      if (+taxAmount == 0 && supperAnnuation == 0) {
        orderLineValues.push({
          description: `Audit Fee- ${name}`,
          quantity: 1,
          rate: +contractFee,
          account: [1905109],
          "tax-rate": [781013],
          net: +contractFee,
          tax: 0,
          total: +contractFee,
          parent: +supplierEntryCreatedId,
          index: 1,
        });
      } else if (+taxAmount > 0 && supperAnnuation == 0) {
        orderLineValues.push({
          description: `Audit Fee- ${name}`,
          quantity: 1,
          rate: +contractFee,
          account: [1905109],
          "tax-rate": [781017],
          net: +contractFee,
          tax: +contractFee * 0.1,
          total: +contractFee + +contractFee * 0.1,
          parent: +supplierEntryCreatedId,
          index: 1,
        });
      } else if (+taxAmount == 0 && supperAnnuation > 0) {
        orderLineValues.push(
          {
            description: `Audit Fee- ${name}`,
            quantity: 1,
            rate: +contractFee - supperAnnuation,
            account: [1905109],
            "tax-rate": [781013],
            net: +contractFee - supperAnnuation,
            tax: 0,
            total: +contractFee - supperAnnuation,
            parent: +supplierEntryCreatedId,
            index: 1,
          },
          {
            description: `Audit Fee Super- ${name}`,
            quantity: 1,
            rate: +supperAnnuation,
            account: [1905111],
            "tax-rate": [781010],
            net: +supperAnnuation,
            tax: 0,
            total: +supperAnnuation,
            parent: +supplierEntryCreatedId,
            index: 2,
          },
          {
            description: `Audit Fee Super- ${name}`,
            quantity: 1,
            rate: +supperAnnuation * -1,
            account: [781065],
            "tax-rate": [781010],
            net: +supperAnnuation * -1,
            tax: 0,
            total: +supperAnnuation * -1,
            parent: +supplierEntryCreatedId,
            index: 3,
          }
        );
      } else if (+taxAmount > 0 && supperAnnuation > 0) {
        orderLineValues.push(
          {
            description: `Audit Fee- ${name}`,
            quantity: 1,
            rate: +contractFee - supperAnnuation,
            account: [1905109],
            "tax-rate": [781017],
            net: +contractFee - supperAnnuation,
            tax: 0.1 * (+contractFee - supperAnnuation),
            total: +contractFee - supperAnnuation + 0.1 * (+contractFee - supperAnnuation),
            parent: +supplierEntryCreatedId,
            index: 1,
          },
          {
            description: `Audit Fee Super- ${name}`,
            quantity: 1,
            rate: +supperAnnuation,
            account: [1905111],
            "tax-rate": [781010],
            net: +supperAnnuation,
            tax: 0,
            total: +supperAnnuation,
            parent: +supplierEntryCreatedId,
            index: 2,
          },
          {
            description: `Audit Fee Super- ${name}`,
            quantity: 1,
            rate: +supperAnnuation * -1,
            account: [781065],
            "tax-rate": [781010],
            net: +supperAnnuation * -1,
            tax: 0,
            total: +supperAnnuation * -1,
            parent: +supplierEntryCreatedId,
            index: 3,
          }
        );
      }

      // Add travel allowance if applicable
      if (travelAllowanceAmount > 0) {
        const rate = travelAllowanceAmount / 1.1;
        const tax = travelAllowanceAmount - rate;
        orderLineValues.push({
          description: `Travel Allowance`,
          quantity: 1,
          rate: rate.toFixed(2),
          account: [781047],
          "tax-rate": [781017],
          net: rate.toFixed(2),
          tax: tax.toFixed(2),
          total: travelAllowanceAmount.toFixed(2),
          parent: +supplierEntryCreatedId,
          index: orderLineValues.length + 1,
        });
      }

      // Create Xero order line items based on order line values
      let orderLineItemsCreation = await C.createEntries({
        values: orderLineValues,
        recordInternalId: "xero-order-items",
        options: { returnRecordInfo: true, makeAutoId: true },
      });

      // Sum subrecords for net, tax, and total values
      let sumTotal = await C.sumSubrecords(
        [+orderLineItemsCreation.success[0].value["11771"]],
        "supplier-bills",
        ["xero-order-items"],
        "total"
      );
      let sumTax = await C.sumSubrecords(
        [+orderLineItemsCreation.success[0].value["11771"]],
        "supplier-bills",
        ["xero-order-items"],
        "tax"
      );
      let sumNet = await C.sumSubrecords(
        [+orderLineItemsCreation.success[0].value["11771"]],
        "supplier-bills",
        ["xero-order-items"],
        "net"
      );

      // Update supplier bill with final totals
      const finalTotal = Object.values(sumTotal)[0]["xero-order-items"];
      const finalTax = Object.values(sumTax)[0]["xero-order-items"];
      const finalNet = Object.values(sumNet)[0]["xero-order-items"];

      await C.updateEntries({
        updates: [
          {
            value: {
              "net-total": finalNet,
              total: +finalTotal,
              "tax-total": +finalTax,
            },
            recordInternalId: "supplier-bills",
            entryId: +supplierEntryCreatedId,
          },
        ],
      });

      let SupplierEntryData = await C.getEntry({
        entryId: +orderLineItemsCreation.success[0].value["11771"],
        recordInternalId: "supplier-bills",
        loadSubrecords: true,
        subrecords: [
          {
            internalId: "xero-order-items",
            responseType: "iov",
          },
        ],
      });

      await C.updateEntries({
        updates: [
          {
            value: {
              "648800-name": SupplierEntryData.autoId,
            },
            recordInternalId: "supplier-bills",
            entryId: +supplierEntryCreatedId,
          },
        ],
      });

      await C.updateEntries({
        updates: [
          {
            value: {
              "648800-linked-supplier-bill": [SupplierEntryData.recordValueId],
            },
            recordInternalId: "awg-role-assignments",
            entryId: +currentEntryData.recordValueId,
          },
        ],
      });

      if (
        !SupplierEntryData["648800-audit-team-member"] ||
        !SupplierEntryData["648800-audit-team-member"].length
      ) {
        throw "No supplier associated with the bill";
      }
      const supplierValue = SupplierEntryData["648800-audit-team-member"][0];

      const supplier = await C.getEntry({
        recordInternalId: "awg-audit-team-members",
        entryId: supplierValue,
      });

      if (
        !supplier["648800-xero-id"] ||
        (supplier["648800-xero-id"] && supplier["648800-xero-id"].trim() === "")
      ) {
        const xeroSupplierEntryData = {
          contactID: supplier["648800-xero-id"],
          name: supplier["full-name"],
          emailAddress: supplier.email,
        };

        const xeroSupplierResponse = await C.xeroUpsert({
          recordId: supplier.recordId,
          entryId: supplier.recordValueId,
          xeroTenantId: tenantId,
          correspondingRecordType: "contact",
          xeroEntryData: xeroSupplierEntryData,
        });

        const xeroUpdatedContactInfo = xeroSupplierResponse.body.contacts[0];

        await C.updateEntries({
          updates: [
            {
              value: {
                "648800-xero-id": xeroUpdatedContactInfo.contactID,
                "648800-xero-updated-date-utc": new Date(
                  xeroUpdatedContactInfo.updatedDateUTC
                ).toISOString(),
              },
              entryId: supplier.recordValueId,
              recordInternalId: "awg-audit-team-members",
            },
          ],
          options: { returnRecordInfo: true },
        });
      }

      const updatedSupplierDetail = await C.getEntry({
        recordInternalId: "awg-audit-team-members",
        entryId: supplierValue,
      });

      const lineItemsData = SupplierEntryData.subrecords["xero-order-items"];

      // Retrieve and format line items for Xero
      const getLineItems = async () => {
        return await Promise.all(
          lineItemsData.map(async (item) => {
            const accountId = (item.account && item.account[0]) || "200";
            const [itemAccount] =
              accountId &&
              (await C.getEntry({ recordInternalId: "accounts", entryIds: [+accountId] }));
            const taxRate = item["tax-rate"][0] || null;
            const [taxRateValue] =
              taxRate &&
              (await C.getEntry({ recordInternalId: "xero-tax-rates", entryIds: [+taxRate] }));

            return {
              description: item.description || "test",
              quantity: item.quantity,
              unitAmount: item.rate,
              accountCode: itemAccount.code.toString(),
              taxType: taxRateValue["xero-id"] || taxRateValue.code || null,
            };
          })
        );
      };

      // Prepare expense data for Xero
      const expenseData = {
        type: "ACCPAY",
        contact: { contactID: updatedSupplierDetail["648800-xero-id"] },
        dueDate: moment(SupplierEntryData["due-date"] || undefined).format("YYYY-MM-DD"),
        date: moment(SupplierEntryData.date || undefined).format("YYYY-MM-DD"),
        lineAmountTypes: "Exclusive",
        currencyCode: "AUD",
        status: "DRAFT",
        invoiceNumber: SupplierEntryData.reference,
        lineItems: await getLineItems(),
        brandingThemeID: brandingThemeID,
      };

      // Upsert expense in Xero and update supplier bill record
      const xeroExpenseResponse = await C.xeroUpsert({
        recordId: SupplierEntryData.recordId,
        entryId: SupplierEntryData.recordValueId,
        xeroTenantId: tenantId,
        correspondingRecordType: "bill",
        xeroEntryData: expenseData,
      });

      const xeroExpenseUpdatedInfo = xeroExpenseResponse.body.invoices[0];

      await C.updateEntries({
        updates: [
          {
            value: {
              "xero-id": xeroExpenseUpdatedInfo.invoiceID,
              "xero-updated-date-utc": new Date(
                xeroExpenseUpdatedInfo.updatedDateUTC
              ).toISOString(),
            },
            entryId: SupplierEntryData.recordValueId,
            recordInternalId: "supplier-bills",
          },
        ],
        options: { returnRecordInfo: true },
      });

      C.log("Success after expense sync!");
    }

    // Mark the audit as having generated RCTIs
    const rctIrersponse = await C.updateEntries({
      updates: [
        {
          recordInternalId: "awg-audits",
          entryId: currentEntry.recordValueId,
          value: {
            "rctis-generated": true,
          },
        },
      ],
    });
  }
}
