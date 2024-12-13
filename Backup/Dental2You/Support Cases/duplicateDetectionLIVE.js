async function script(C) {
    const { entryId, recordInternalId } = C.getEvent();
    const currentEntry = await C.getCurrentEntry();
    const {
        timezone: companyTimeZone = "Australia/Sydney",
    } = await C.getCompanySettings();

    // Add the current entry to the summary for debugging
    // C.addJsonToSummary(currentEntry);

    if (currentEntry.centre && currentEntry.centre.length > 0) {
        C.log("Centre ID: ", currentEntry.centre[0]);
    } else {
        C.log("Centre information missing or undefined");
    }

    /* =========== To REMOVE in PRODUCTION =========== */
    // if (currentEntry.centre[0] !== 1310042) {
    //     return { message: "Centre is not Test Centre." };
    // }
    /* =========== To REMOVE in PRODUCTION =========== */

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

    // Uncomment the check for appointment type if necessary
    // if (!isDentalAppointmentChecked && !isOpticalAppointmentChecked) {
    //     return { message: "No appointment type selected." };
    // }

    try {
        // Log Medicare details for debugging
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

            // Log filtered patient entries for debugging
            C.log("Filtered patients: ", res.entries);

            patients = res.entries.filter(
                (patient) =>
                    patient.recordValueId !== currentEntry.recordValueId
            );
        }

        // Log if matching patients are found
        C.log("Matched Patients: ", patients);

        // If no exact match found, use partial matching
        if (!patients || patients.length === 0) {
            const partialFilters = buildPartialFilters(currentEntry);
            C.log("Partial Filters: ", partialFilters);
            const partialRes = await C.filterEntries({ 
                filter: partialFilters, 
                recordInternalId: "dental2you-patients", 
                ignoreLimits: true 
            });
            // C.log("Partial RES: ",partialRes);
            const partialPatients = partialRes.entries.filter(patient => patient.recordValueId !== currentEntry.recordValueId);
            C.log("Partial Patients: ",partialPatients);

            if (partialPatients.length > 0) {
                partialMatch = true;
                triggerCreateAppointment = true;
                partialMatchPatients = partialPatients.map(patient => patient.recordValueId);
            }

            C.addJsonToSummary({
                partialRes,
                partialPatients,
            });
        }

        
        // Handle patient merging if exact match is found
        if (patients.length > 0) {
            selectedPatientId = patients[0].recordValueId;
            if (+selectedPatientId === +currentEntry.recordValueId) {
                C.addJsonToSummary({
                    mssg:
                        "You cannot choose same patient for merging process.",
                });
                return;
            }
            const duplicatePatient = await C.getEntry({
                recordInternalId: "dental2you-patients",
                // entryId: patients[0].recordValueId,
                entryId: +selectedPatientId,
            });
            
            C.addJsonToSummary({duplicatePatient});

            await mergePatients(C, currentEntry, duplicatePatient, selectedPatientId);

        }

        if (triggerCreateAppointment) {
            // Handle Dental Appointment
            if (isDentalAppointmentChecked) {
                C.log("Searching for future dental visits...");
                const dentalVisit = await getFutureVisit(
                    C,
                    200806219,
                    currentEntry.centre,
                    companyTimeZone
                );
                C.log("Dental Visit Found: ", dentalVisit);

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
                        partialMatchPatients
                    );
                    if (dentalAppointmentId) {
                        createdAppointmentIds.push(dentalAppointmentId);
                        C.log(
                            "Dental Appointment Created: ",
                            dentalAppointmentId
                        );
                    }
                    
                    const link = `https://app.clevero.co/app/records/1198026/view/${dentalAppointmentId}`;
                    C.addHtmlToSummary(
                    `
                    <h3>Dental Appointment Created Successfully!</h3>
                    <p><b>Link:</b> <a href="${link}" target="_blank">${link}</a></p>
                    `
                    );
                } else {
                    // Tick the No Dental Centre Visit found
                    await C.updateEntries({
                        updates: [
                            {
                                recordInternalId: "dental2you-patients",
                                entryId: currentEntry.recordValueId,
                                value: { 
                                    "1188947-no-centre-visit-found": true 
                                },
                            },
                        ],
                    });
                    
                    C.addJsonToSummary({ message: "No future dental visit found." });
                }
            }

            // Handle Optical Appointment
            if (isOpticalAppointmentChecked) {
                C.log("Searching for future optical visits...");
                const opticalVisit = await getFutureVisit(
                    C,
                    200806226,
                    currentEntry.centre,
                    companyTimeZone
                );
                C.log("Optical Visit Found: ", opticalVisit);

                if (opticalVisit) {
                    const opticalAppointmentId = await createAppointment(
                        C,
                        opticalVisit,
                        selectedPatientId,
                        currentEntry,
                        companyTimeZone,
                        200806226,
                        partialMatch,
                        partialMatchPatients
                    );
                    if (opticalAppointmentId) {
                        createdAppointmentIds.push(opticalAppointmentId);
                        C.log(
                            "Optical Appointment Created: ",
                            opticalAppointmentId
                        );
                    }
                    
                    const link = `https://app.clevero.co/app/records/1198026/view/${opticalAppointmentId}`;
                    C.addHtmlToSummary(
                    `
                    <h3>Optical Appointment Created Successfully!</h3>
                    <p><b>Link:</b> <a href="${link}" target="_blank">${link}</a></p>
                    `
                    );
                } else {
                    // Tick the No Optical Centre Visit found
                    await C.updateEntries({
                        updates: [
                            {
                                recordInternalId: "dental2you-patients",
                                entryId: currentEntry.recordValueId,
                                value: { 
                                    "1188947-no-optical-centre-visit-found": true 
                                },
                            },
                        ],
                    });
                    
                    C.addJsonToSummary({ message: "No future optometrist visit found." });
                }
            }

            if (createdAppointmentIds && createdAppointmentIds.length > 0) {
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

        // Log created appointments for summary
        // C.addJsonToSummary({ createdAppointmentIds });

        return {
            message: "Appointments created successfully.",
            appointmentIds: createdAppointmentIds,
        };
    } catch (error) {
        C.log("Error: ", error);
        return { error: error.message };
    }
}

// Helper function to create filters for partial matching
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
            { subject: "first-name", requestType: "i", type: "text", operator: "equals", ignoreCase: true, value: currentEntry["first-name"] },
            "and",
            { subject: "date-of-birth", requestType: "i", type: "date", operator: "equals", ignoreCase: true, value: { relative: false, value: currentEntry["date-of-birth"] } }
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

// Helper function to get the nearest future visit of a specific type
async function getFutureVisit(C, visitType, centre, companyTimeZone) {
    // Log to help debug the centre and visitType
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

    // Log centre details to confirm associations
    C.log("Centre Details with Associations: ", centreDetails);

    const associatedVisits =
        centreDetails.associations["dental2you-appointments"] || [];
    const today = moment.tz(companyTimeZone).startOf("day").format();

    associatedVisits.sort(
        (a, b) =>
            moment(a["start-time"]).tz(companyTimeZone).valueOf() -
            moment(b["start-time"]).tz(companyTimeZone).valueOf()
    );

    // const futureVisit = associatedVisits.find(
    //     (visit) =>
    //         visit["visit-type"][0] === visitType &&
    //         moment(visit["end-time"]).tz(companyTimeZone).isAfter(today)
    // );

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

    // Log the selected future visit
    C.log("Future Visit Found: ", futureVisit);

    return futureVisit;
}

// Helper function to create an appointment
async function createAppointment(
    C,
    visit,
    patientId,
    currentEntry,
    companyTimeZone,
    appointmentType,
    partialMatch,
    partialMatchPatients,
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

    // Log appointment details for debugging
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
            // options: { indexValue: false },
        });
        
        C.addJsonToSummary({
            createAppointmentRes,
            id: createAppointmentRes.success[0].id
        });

        C.log("Appointment created successfully", createAppointmentRes);
        return createAppointmentRes.success[0].id;
    } catch (error) {
        C.log("Error creating appointment: ", error);
        throw error;
    }
}

// Helper function to merge patient data
async function mergePatients(C, currentPatient, duplicatePatient, selectedPatientId) {
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
        ...(duplicatePatient["attachments"] || [])
    ];

    const mergedAllergies = [
        ...(currentPatient["1188947-allergy-options"] || []),
        ...(duplicatePatient["1188947-allergy-options"] || [])
    ];

    const existingAllergies = mergeTextFields(
        currentPatient["allergies"] || "",
        duplicatePatient["allergies"] || ""
    );

    const existingMedicalConditions = mergeTextFields(
        currentPatient["medical-conditions"] || "",
        duplicatePatient["medical-conditions"] || ""
    );

    const updateValue = {
        ...valuesToBeOverride,
        attachments: mergedAttachments,
        "1188947-allergy-options": mergedAllergies || [],
        allergies: existingAllergies || "",
        "medical-conditions": existingMedicalConditions || "",
    };

    await C.updateEntries({
        updates: [{
            value: updateValue,
            entryId: +selectedPatientId,
            recordInternalId: "dental2you-patients",
        }]
    });
}

function mergeTextFields(currentField, duplicateField) {
    return currentField.length > 0 ? `${currentField} \n${duplicateField}` : duplicateField;
}
