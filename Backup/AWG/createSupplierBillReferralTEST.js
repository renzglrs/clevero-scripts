async function script(C) {
    const { entries: audits } = await C.getEntries({
        recordInternalId: "awg-audits",
        limit: 50,
        // limit: 1,
        filter: [
            [
                {
                    subject: "648800-referral-bonus-check-completed",
                    requestType: "i",
                    type: "checkbox",
                    operator: "is_false",
                },
                "or",
                {
                    subject: "648800-referral-bonus-check-completed",
                    requestType: "i",
                    type: "checkbox",
                    operator: "is_empty",
                },
            ],
        ],
    });
    // const audits = await C.getEntries({
    //     entryIds: [2511864, 1479739],
    //     recordInternalId: "awg-audits",
    // });
    C.addJsonToSummary({ audits });
    
    
    let auditCycleIds = _.without(
        audits.map((audit) => +audit.sale[0]),
        null,
        undefined
    );

    auditCycleIds = auditCycleIds.filter((id) => id);
    C.addJsonToSummary({ auditCycleIds }, { enableCopy: true });
    
    const auditCycles = await C.getEntries({
        entryIds: auditCycleIds,
        recordInternalId: "awg-sales",
        loadAssociations: true,
        associations: [
            {
                internalId: "awg-proposals",
                linkedFieldInternalId: "sale",
            },
        ],
    });

    const validProviders = await C.filterEntries({
        filter: [
            {
                subject: "648800-referral-bonus-applied",
                requestType: "i",
                type: "checkbox",
                operator: "is_false",
                ignoreCase: true,
            },
        ],
        limit: 10000,
        recordInternalId: "awg-providers",
    });

    C.addJsonToSummary({ validProviders }, { enableCopy: true });
    const validProviderIds = validProviders.entries.map(
        (entry) => entry.recordValueId
    );

    C.addJsonToSummary({ validProviderIds }, { enableCopy: true });
    // return;

    const salesToAuditMapper = _.fromPairs(
        audits
            .filter((a) => a.sale && a.sale[0])
            .map((a) => [a["sale"][0], a.recordValueId])
    );

    const proposalToAuditMapper = _.fromPairs(
        _.flatten(
            auditCycles.map((ac) => {
                const proposals = ac.associations["awg-proposals"];
                return proposals.map((p) => [
                    p.recordValueId,
                    salesToAuditMapper[p["sale"][0]],
                ]);
            })
        )
    );

    let proposalsForSupplierBills = [];
    let nonReferralProposals = [];

    C.addJsonToSummary(auditCycles);

    auditCycles.forEach((ac) => {
        const proposals = ac.associations["awg-proposals"];
        proposals.forEach((p) => {
            C.log("found", validProviderIds.includes(+p["provider"][0]));
            C.log(p["provider"][0]);
            if (p["approved-proposal"] && p["approved-proposal"].length) {
                if (
                    +p["648800-referral"] &&
                    +p["648800-referral"][0] === 1142 &&
                    +p["648800-referral-amount"] > 0 &&
                    validProviderIds.includes(+p["provider"][0])
                ) {
                    proposalsForSupplierBills.push(p);
                } else {
                    if (
                        (+p["648800-referral"] &&
                            +p["648800-referral"][0] === 1143) ||
                        !p["648800-referral"] ||
                        !p["648800-referral-amount"]
                    ) {
                        nonReferralProposals.push(p);
                    }
                }
            }
        });
    });

    C.addJsonToSummary({
        proposalsForSupplierBills,
        nonReferralProposals,
    });

    // update bonus check as true for associated audits for non referral proposals

    await C.updateEntries({
        updates: nonReferralProposals.map((p) => {
            return {
                value: {
                    "648800-referral-bonus-check-completed": true,
                },
                entryId: proposalToAuditMapper[p.recordValueId],
                recordInternalId: "awg-audits",
            };
        }),
    });

    await C.updateEntries({
        updates: nonReferralProposals.map((p) => {
            return {
                value: {
                    "648800-referral-bonus-applied": true,
                },
                entryId: p["provider"][0],
                recordInternalId: "awg-providers",
            };
        }),
    });

    // create supplier bills and sync to xero for "proposalsForSupplierBills"
    const providerIds = _.uniqBy(
        proposalsForSupplierBills.map((p) => p.provider[0])
    );
    
    const providers = await C.getEntries({
        recordInternalId: "awg-providers",
        entryIds: providerIds,
    });

    const providersWithIdMapper = _.groupBy(providers, "recordValueId");

    const { entries: auditTypes }  = await C.filterEntries({
        filter: [
        ],
        limit: 10000,
        recordInternalId: "awg-audit-types",
    });
    
    C.addJsonToSummary({auditTypes});

    const allSupplierIds = _.uniq(
        proposalsForSupplierBills
            .map(
                (p) =>
                    p["648800-referral-supplier"] &&
                    p["648800-referral-supplier"][0]
            )
            .filter((id) => id)
    );

    const suppliers = await C.getEntries({
        entryIds: allSupplierIds,
        recordInternalId: "xero-suppliers",
    });

    const groupSupplierByRecordValueId = _.groupBy(suppliers, "recordValueId");

    const groupedProposals = proposalsForSupplierBills.reduce((acc, p) => {
        const supplierId =
            p["648800-referral-supplier"] && p["648800-referral-supplier"][0];
        if (!supplierId) return acc;

        if (!acc[supplierId]) {
            acc[supplierId] = [];
        }
        acc[supplierId].push(p);

        return acc;
    }, {});

    // Step 2: Iterate over each supplier and create the corresponding supplier bill and lines
    for (const supplierId in groupedProposals) {
        if (!groupedProposals.hasOwnProperty(supplierId)) continue;

        const proposals = groupedProposals[supplierId];
        const supplierName = groupSupplierByRecordValueId[supplierId][0].name;
        const date = C.moment();

        // Calculating the totals for the supplier bill
        const referralAmountTotal = proposals.reduce(
            (sum, p) => sum + +p["648800-referral-amount"],
            0
        );

        const dataValue = {
            date: date.format("YYYY-MM-DD"),
            "due-date": date.clone().add(15, "days").format("YYYY-MM-DD"),
            supplier: [supplierId],
            "tax-total": (referralAmountTotal * 0.1).toFixed(2),
            "net-total": referralAmountTotal.toFixed(2),
            total: (referralAmountTotal * 1.1).toFixed(2),
            currency: [713002], //AUD
            "xero-status": [34126], //DRAFT
            reference: `Referral Fee: ${supplierName} - ${date.format(
                "MMMM"
            )} - ${date.format("YYYY")}`,
            "648800-name": `${supplierName} - ${moment().format(
                "MMMM"
            )} - ${moment().format("YYYY")}`,
        };

        // Step 3: Create the supplier bill entry
        const supplierBillResponse = await C.createEntries({
            recordInternalId: "supplier-bills",
            values: [dataValue],
            options: {
                returnRecordInfo: true,
                makeAutoId: true,
            },
        });

        const supplierBillId = supplierBillResponse.success[0].id;
        if (supplierBillId) {
            // Step 4: Create the line items for each referral fee under the supplier bill
            for (let i = 0; i < proposals.length; i++) {
                const p = proposals[i];
                const provider = providersWithIdMapper[p.provider[0]][0] || {};
                const providerName = provider.name;
                const referralAmount = +p["648800-referral-amount"];
                const auditTypeObject = auditTypes.find(auditType => auditType.recordValueId === p["audit-type"][0]);
                const grandTotal = (p["grand-total"]/1.1).toFixed(2) || 0;
                const auditType = auditTypeObject.name;

                await C.createEntry({
                    recordInternalId: "xero-order-items",
                    value: {
                        parent: supplierBillId,
                        index: i + 1,
                        description: `Referral Fee: ${providerName} - ${auditType} - $${grandTotal}`,
                        quantity: 1,
                        rate: referralAmount,
                        net: referralAmount,
                        tax: referralAmount * 0.1,
                        total: referralAmount * 1.1,
                        "tax-rate": [781017], //GST ON EXPENSES
                        account: [1905110], // 312 Referrer Fees
                        "648800-audit": [proposalToAuditMapper[proposals[0].recordValueId]], // Adding the audit ID here
                    },
                });

                await C.updateEntries({
                    updates: [
                        {
                            value: {
                                "648800-referral-bonus-applied": true,
                            },
                            entryId: provider.recordValueId,
                            recordInternalId: "awg-providers",
                        },
                    ],
                });
            }
        }

        // Step 5: Update the original proposals to mark referral-bonus-check-completed as true
        if (supplierBillId) {
            await C.updateEntries({
                updates: proposals.map((p) => {
                    return {
                        value: {
                            "648800-referral-bonus-check-completed": true,
                        },
                        entryId: proposalToAuditMapper[p.recordValueId],
                        recordInternalId: "awg-audits",
                    };
                }),
            });
        }
    }
    return { proposalsForSupplierBills, nonReferralProposals };
    for (let i = 0; i < proposalsForSupplierBills.length; i++) {
        const p = proposalsForSupplierBills[i];
        const supplierId =
            p["648800-referral-supplier"] && p["648800-referral-supplier"][0];
        const provider = providersWithIdMapper[p.provider[0]][0] || {};
        const providerName = provider.name;
        const referralAmount = +p["648800-referral-amount"];
        const date = C.moment();

        const supplierName = supplierId
            ? groupSupplierByRecordValueId[supplierId][0].name
            : "";

        const dataValue = {
            date: date.format("YYYY-MM-DD"),
            "due-date": date.clone().add(15, "days").format("YYYY-MM-DD"),
            supplier: supplierId ? [supplierId] : [],
            "tax-total": (referralAmount * 0.1).toFixed(2),
            "net-total": referralAmount.toFixed(2),
            total: (referralAmount * 1.1).toFixed(2),
            currency: [713002], //AUD
            "xero-status": [34126], //DRAFT
            reference: `Referral Fee: ${supplierName} - ${moment().format(
                "MMMM"
            )} - ${moment().format("YYYY")}`,
            "648800-name": `${supplierName} - ${moment().format(
                "MMMM"
            )} - ${moment().format("YYYY")}`,
        };

        const supplierBillResponse = await C.createEntries({
            recordInternalId: "supplier-bills",
            values: [dataValue],
            options: {
                returnRecordInfo: true,
                makeAutoId: true,
            },
        });

        const supplierBillId = supplierBillResponse.success[0].id;

        await C.createEntry({
            recordInternalId: "xero-order-items",
            value: {
                parent: supplierBillId,
                index: i + 1,
                description: `Referral Fee: ${providerName}`,
                quantity: 1,
                rate: referralAmount,
                net: referralAmount,
                tax: referralAmount * 0.1,
                total: referralAmount * 1.1,
                "tax-rate": [781017], //GST ON EXPENSES
                account: [1905110], // 312 Referrer Fees
                "648800-audit": [proposalToAuditMapper[proposals[0].recordValueId]], // Adding the audit ID here
            },
        });
        if (supplierBillId) {
            await C.updateEntries({
                updates: proposalsForSupplierBills.map((p) => {
                    return {
                        value: {
                            "648800-referral-bonus-check-completed": true,
                        },
                        entryId: proposalToAuditMapper[p.recordValueId],
                        recordInternalId: "awg-audits",
                    };
                }),
            });
        }
    }

    return { proposalsForSupplierBills, nonReferralProposals };
}
