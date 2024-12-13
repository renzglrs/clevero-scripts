async function script(C) {
    const { entryId, recordInternalId } = C.getEvent();
    const currentEntry = await C.getCurrentEntry();
    const {
        timezone: companyTimeZone = "Australia/Sydney",
    } = await C.getCompanySettings();

    if (currentEntry.centre && currentEntry.centre.length > 0) {
        C.log("Centre ID: ", currentEntry.centre[0]);
    } else {
        C.log("Centre information missing or undefined");
    }

    let triggerCreateAppointment = true;
    let partialMatch = false;
    let partialMatchPatients = [];
    let selectedPatientId = currentEntry.recordValueId;
    let patients = [];
    let createdAppointmentIds = [];
    const isDentalAppointmentChecked =
        currentEntry["1188947-is-dental"] || false;
    const isOpticalAppointmentChecked =
        currentEntry["1188947-is-optical"] || false;

    try {
        C.log("Checking Medicare details: ", {
            "medicare-number": currentEntry["medicare-number"],
            "medicare-reference": currentEntry["medicare-reference"],
            "first-name": currentEntry["first-name"],
        });

        if (
            currentEntry["medicare-number"] &&
            currentEntry["medicare-reference"] &&
            currentEntry["first-name"]
        ) {
            const filters = [
                {
                    subject: "medicare-number",
                    requestType: "i",
                    type: "text",
                    operator: "starts_with",
                    ignoreCase: true,
                    value: currentEntry["medicare-number"].substring(0, 9),
                },
                "and",
                {
                    subject: "medicare-reference",
                    requestType: "i",
                    type: "text",
                    operator: "equals",
                    ignoreCase: true,
                    value: currentEntry["medicare-reference"],
                },
                "and",
                {
                    subject: "first-name",
                    requestType: "i",
                    type: "text",
                    operator: "equals",
                    ignoreCase: true,
                    value: currentEntry["first-name"],
                },
            ];

            const res = await C.filterEntries({
                filter: filters,
                recordInternalId: "dental2you-patients",
                ignoreLimits: true,
            });

            C.log("Filtered patients: ", res.entries);

            patients = res.entries.filter(
                (patient) =>
                    patient.recordValueId !== currentEntry.recordValueId
            );
        }

        C.log("Matched Patients: ", patients);

        if (!patients || patients.length === 0) {
            const partialFilters = buildPartialFilters(currentEntry);
            C.log("Partial Filters: ", partialFilters);
            const partialRes = await C.filterEntries({
                filter: partialFilters,
                recordInternalId: "dental2you-patients",
                ignoreLimits: true,
            });
            const partialPatients = partialRes.entries.filter(
                (patient) =>
                    patient.recordValueId !== currentEntry.recordValueId
            );
            C.log("Partial Patients: ", partialPatients);

            if (partialPatients.length > 0) {
                partialMatch = true;
                triggerCreateAppointment = true;
                partialMatchPatients = partialPatients.map(
                    (patient) => patient.recordValueId
                );
            }

            C.addJsonToSummary({
                partialRes,
                partialPatients,
            });
        }

        let isMergedAppointment = false;
        if (patients.length > 0) {
            selectedPatientId = patients[0].recordValueId;
            if (+selectedPatientId === +currentEntry.recordValueId) {
                C.addJsonToSummary({
                    mssg: "You cannot choose same patient for merging process.",
                });
                return;
            }
            const duplicatePatient = await C.getEntry({
                recordInternalId: "dental2you-patients",
                entryId: +selectedPatientId,
            });

            C.addJsonToSummary({ duplicatePatient });

            await mergePatients(
                C,
                currentEntry,
                duplicatePatient,
                selectedPatientId,
                false, // Initial values for noDentalVisitFound
                false  // Initial values for noOpticalVisitFound
            );

            isMergedAppointment = true;
        }

        if (triggerCreateAppointment) {
            let noDentalVisitFound = false;
            let noOpticalVisitFound = false;

            if (isDentalAppointmentChecked) {
                C.log("Searching for future dental visits...");
                const dentalVisit = await getFutureVisit(
                    C,
                    200806219,
                    currentEntry.centre,
                    companyTimeZone
                );

                if (dentalVisit) {
                    C.log("Creating Dental Appointment...");
                    const dentalAppointmentId = await createAppointment(
                        C,
                        dentalVisit,
                        selectedPatientId,
                        currentEntry,
                        companyTimeZone,
                        200806219,
                        partialMatch,
                        partialMatchPatients,
                        isMergedAppointment
                    );

                    if (dentalAppointmentId) {
                        createdAppointmentIds.push(dentalAppointmentId);
                        const link = `https://app.clevero.co/app/records/1198026/view/${dentalAppointmentId}`;
                        C.addHtmlToSummary(
                            `
                            <h3>Dental Appointment Created Successfully!</h3>
                            <p><b>Link:</b> <a href="${link}" target="_blank">${link}</a></p>
                            `
                        );
                    }
                } else {
                    noDentalVisitFound = true;
                    C.log("No Dental Visit Found."); // Log the flag setting
                }
            }

            if (isOpticalAppointmentChecked) {
                C.log("Searching for future optical visits...");
                const opticalVisit = await getFutureVisit(
                    C,
                    200806226,
                    currentEntry.centre,
                    companyTimeZone
                );

                if (opticalVisit) {
                    const opticalAppointmentId = await createAppointment(
                        C,
                        opticalVisit,
                        selectedPatientId,
                        currentEntry,
                        companyTimeZone,
                        200806226,
                        partialMatch,
                        partialMatchPatients,
                        isMergedAppointment
                    );

                    if (opticalAppointmentId) {
                        createdAppointmentIds.push(opticalAppointmentId);
                        const link = `https://app.clevero.co/app/records/1198026/view/${opticalAppointmentId}`;
                        C.addHtmlToSummary(
                            `
                            <h3>Optical Appointment Created Successfully!</h3>
                            <p><b>Link:</b> <a href="${link}" target="_blank">${link}</a></p>
                            `
                        );
                    }
                } else {
                    noOpticalVisitFound = true;
                    C.log("No Optical Visit Found."); // Log the flag setting
                }
            }

            C.log("Flags before update:", {
                noDentalVisitFound,
                noOpticalVisitFound,
            });

            await C.updateEntries({
                updates: [
                    {
                        recordInternalId: "dental2you-patients",
                        entryId: currentEntry.recordValueId,
                        value: {
                            "1188947-no-centre-visit-found": noDentalVisitFound,
                            "1188947-no-optical-centre-visit-found": noOpticalVisitFound,
                        },
                    },
                ],
            });

            if (createdAppointmentIds.length > 0) {
                await C.updateEntries({
                    updates: [
                        {
                            recordInternalId: "dental2you-patients",
                            entryId: currentEntry.recordValueId,
                            value: { "1188947-appointment-created": true },
                        },
                    ],
                });

                C.log("Appointment creation flagged in patient record.");
            } else {
                return { message: "No appointment was created." };
            }
        }

        return {
            message: "Appointments created successfully.",
            appointmentIds: createdAppointmentIds,
        };
    } catch (error) {
        C.log("Error: ", error);
        return { error: error.message };
    }
}

function buildPartialFilters(currentEntry) {
    const partialFilters = [];

    if (currentEntry["medicare-number"] && currentEntry["medicare-number"].length > 0) {
        if (partialFilters.length > 0) {
            partialFilters.push("or");
        }
        partialFilters.push({
            subject: "medicare-number",
            requestType: "i",
            type: "text",
            operator: "starts_with",
            ignoreCase: true,
            value: currentEntry["medicare-number"].substring(0, 9),
        });
    }

    if (currentEntry["email"] && currentEntry["email"].length > 0) {
        if (partialFilters.length > 0) {
            partialFilters.push("or");
        }
        partialFilters.push({
            subject: "email",
            requestType: "i",
            type: "text",
            operator: "equals",
            ignoreCase: true,
            value: currentEntry["email"],
        });
    }

    if (currentEntry["date-of-birth"] && currentEntry["date-of-birth"].length > 0) {
        if (partialFilters.length > 0) {
            partialFilters.push("or");
        }
        partialFilters.push([
            {
                subject: "first-name",
                requestType: "i",
                type: "text",
                operator: "equals",
                ignoreCase: true,
                value: currentEntry["first-name"],
            },
            "and",
            {
                subject: "date-of-birth",
                requestType: "i",
                type: "date",
                operator: "equals",
                ignoreCase: true,
                value: {
                    relative: false,
                    value: currentEntry["date-of-birth"],
                },
            },
        ]);
    }

    if (currentEntry["mobile"] && currentEntry["mobile"].length > 0) {
        if (partialFilters.length > 0) {
            partialFilters.push("or");
        }
        partialFilters.push({
            subject: "mobile",
            requestType: "i",
            type: "text",
            operator: "equals",
            ignoreCase: true,
            value: currentEntry["mobile"],
        });
    }

    return partialFilters;
}

async function getFutureVisit(C, visitType, centre, companyTimeZone) {
    C.log("Fetching future visits for centre and visitType: ", {
        centre,
        visitType,
    });

    const centreDetails = await C.getEntry({
        recordInternalId: "dental2you-locations",
        entryId: centre[0],
        loadAssociations: true,
        associations: [
            { internalId: "dental2you-appointments", responseType: "iov" },
        ],
    });

    C.log("Centre Details with Associations: ", centreDetails);

    const associatedVisits =
        centreDetails.associations["dental2you-appointments"] || [];
    const today = moment.tz(companyTimeZone).startOf("day").format();

    associatedVisits.sort(
        (a, b) =>
            moment(a["start-time"]).tz(companyTimeZone).valueOf() -
            moment(b["start-time"]).tz(companyTimeZone).valueOf()
    );

    const futureVisit = associatedVisits.find((visit) => {
        let visitStartTime = moment(visit["start-time"])
            .tz(companyTimeZone)
            .format();
        let visitEndTime = moment(visit["end-time"])
            .tz(companyTimeZone)
            .format();

        let currentTime = moment().tz(companyTimeZone).format();

        const visitHasType = visit["1188947-visit-type"][0] === visitType;

        return visitHasType && visitEndTime >= currentTime;
    });

    C.log("Future Visit Found: ", futureVisit);

    return futureVisit;
}

async function createAppointment(
    C,
    visit,
    patientId,
    currentEntry,
    companyTimeZone,
    appointmentType,
    partialMatch,
    partialMatchPatients,
    isMergedAppointment = false
) {
    const dentist = visit.dentist || [];
    const dentalAssistant = visit["dental-assistant"] || [];
    const startTime = visit["start-time"];
    const endTime = visit["end-time"];
    const startTimeAEST = moment
        .tz(startTime, companyTimeZone)
        .format("YYYY-MM-DD");
    const endTimeAEST = moment
        .tz(endTime, companyTimeZone)
        .format("YYYY-MM-DD");

    C.log("Creating Appointment with details: ", {
        patientId,
        visitId: visit.recordValueId,
        appointmentType,
        startTimeAEST,
        endTimeAEST,
    });

    const appointmentValues = {
        visit: [visit.recordValueId],
        patient: [patientId],
        centre: [visit.centre[0]],
        dentist: dentist,
        "dental-assistant": dentalAssistant,
        "1188947-appointment-type": [appointmentType],
        date: startTimeAEST,
        "end-date": endTimeAEST,
        phone: currentEntry.mobile,
        name: `${
            currentEntry["full-name"] || ""
        } - ${appointmentType} - ${moment
            .tz(startTime, companyTimeZone)
            .format("MMMM DD, YYYY")}`,
        "1188947-date-created": moment()
            .tz(companyTimeZone)
            .format("YYYY-MM-DD"),
    };

    if (isMergedAppointment) {
        appointmentValues["1188947-merged-appointment"] = true;
    }

    if (partialMatch) {
        appointmentValues["1188947-partial-match-found"] = true;
        appointmentValues[
            "1188947-partial-match-patients"
        ] = partialMatchPatients;
    }

    try {
        const createAppointmentRes = await C.createEntry({
            value: appointmentValues,
            recordInternalId: "dental2you-patient-appointments",
        });

        C.addJsonToSummary({
            createAppointmentRes,
            id: createAppointmentRes.success[0].id,
        });

        C.log("Appointment created successfully", createAppointmentRes);
        return createAppointmentRes.success[0].id;
    } catch (error) {
        C.log("Error creating appointment: ", error);
        throw error;
    }
}

async function mergePatients(
    C,
    currentPatient,
    duplicatePatient,
    selectedPatientId,
    noDentalVisitFound,   // Added parameter
    noOpticalVisitFound   // Added parameter
) {
    const fieldsToOverride = [
        "preferred-name",
        "centre",
        "phone",
        "email",
        "mobile",
        "emergency-contact-name",
        "emergency-contact-relation",
        "address1",
        "address2",
        "suburb",
        "postcode",
        "state",
        "medicare-number",
        "medicare-reference",
        "health-fund",
        "card-no",
        "member-number",
        "rank-number",
        "last-name",
        "1188947-days-attending",
        "1188947-is-dental",
        "1188947-is-optical"
    ];

    const valuesToBeOverride = {};
    fieldsToOverride.forEach((internalId) => {
        const value = currentPatient[internalId];
        if (value) {
            valuesToBeOverride[internalId] = value;
        }
    });

    const mergedAttachments = [
        ...(currentPatient["attachments"] || []),
        ...(duplicatePatient["attachments"] || []),
    ];

    const mergedAllergies = [
        ...(currentPatient["1188947-allergy-options"] || []),
        ...(duplicatePatient["1188947-allergy-options"] || []),
    ];

    const existingAllergies = mergeTextFields(
        currentPatient["allergies"] || "",
        duplicatePatient["allergies"] || ""
    );

    const existingMedicalConditions = mergeTextFields(
        currentPatient["medical-conditions"] || "",
        duplicatePatient["medical-conditions"] || ""
    );

    C.log("Updating patient with the following flags:", {
        noDentalVisitFound,
        noOpticalVisitFound,
    });

    const updateValue = {
        ...valuesToBeOverride,
        "1188947-no-centre-visit-found": noDentalVisitFound,   // Use the passed values here
        "1188947-no-optical-centre-visit-found": noOpticalVisitFound, // Use the passed values here
        attachments: mergedAttachments,
        "1188947-allergy-options": mergedAllergies || [],
        allergies: existingAllergies || "",
        "medical-conditions": existingMedicalConditions || "",
    };

    await C.updateEntries({
        updates: [
            {
                value: updateValue,
                entryId: +selectedPatientId,
                recordInternalId: "dental2you-patients",
            },
        ],
    });
}

function mergeTextFields(currentField, duplicateField) {
    return currentField.length > 0
        ? `${currentField} \n${duplicateField}`
        : duplicateField;
}
