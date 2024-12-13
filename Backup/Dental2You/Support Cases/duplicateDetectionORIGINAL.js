async function script(C) {
    const { entryId, recordInternalId } = C.getEvent();
    const currentEntry = await C.getCurrentEntry();
    const {
        timezone: companyTimeZone = "Australia/Sydney",
    } = await C.getCompanySettings();
    // if (currentEntry.recordValueId != 1310012) {
    //     return;
    // }
    C.addJsonToSummary(currentEntry);
    let triggerCreateAppointment = true;
    let partialMatch = false;
    let selectedPatientId = currentEntry.recordValueId;
    let patients = [];
    let createdAppointmentId = null;
    try {
        // Construct the filters with first name, last name, and date of birth always included, and other conditions in "or" clauses
        if (
            currentEntry["medicare-number"] &&
            currentEntry["medicare-reference"] &&
            currentEntry["first-name"]
        ) {
            C.log(currentEntry["medicare-number"].substring(0, 9));
            const filters = [
                {
                    subject: "medicare-number", // Medicare Number
                    requestType: "i",
                    type: "text",
                    operator: "starts_with",
                    ignoreCase: true,
                    value: currentEntry["medicare-number"].substring(0, 9),
                },
                "and",
                {
                    subject: "medicare-reference", // Phone Number
                    requestType: "i",
                    type: "text",
                    operator: "equals",
                    ignoreCase: true,
                    value: currentEntry["medicare-reference"],
                },
                "and",
                {
                    subject: "first-name", // Email Address
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
            //C.addJsonToSummary(res);

            patients = res.entries;
            patients = patients.filter((patient) => {
                return patient.recordValueId !== currentEntry.recordValueId;
            });
        }
        //C.addJsonToSummary(patients);

        let partialRes = null;
        let partialMatchPatients = [];

        if (!patients || patients.length == 0) {
            C.log("No patients found.");
            //return { message: "No patients found." };
            /*
            First 9 digits of Medicare number matches OR
            Mobile phone matches OR
            email matches OR
            DOB & last name OR
            DOB & first name
            */
            const partialFilters = [];

            if (
                currentEntry["medicare-number"] &&
                currentEntry["medicare-number"].length > 0
            ) {
                if (partialFilters.length > 0) {
                    partialFilters.push("or");
                }
                partialFilters.push({
                    subject: "medicare-number", // Medicare Number
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
                    subject: "email", // Email Address
                    requestType: "i",
                    type: "text",
                    operator: "equals",
                    ignoreCase: true,
                    value: currentEntry["email"],
                });
            }

            if (
                currentEntry["date-of-birth"] &&
                currentEntry["date-of-birth"].length > 0
            ) {
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
            if (
                currentEntry["date-of-birth"] &&
                currentEntry["date-of-birth"].length > 0
            ) {
                if (partialFilters.length > 0) {
                    partialFilters.push("or");
                }
                partialFilters.push([
                    {
                        subject: "last-name",
                        requestType: "i",
                        type: "text",
                        operator: "equals",
                        ignoreCase: true,
                        value: currentEntry["last-name"],
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
                    subject: "mobile", // mobile Number
                    requestType: "i",
                    type: "text",
                    operator: "equals",
                    ignoreCase: true,
                    value: currentEntry["mobile"],
                });
            }

            partialRes = await C.filterEntries({
                filter: partialFilters,
                recordInternalId: "dental2you-patients",
                ignoreLimits: true,
            });

            partialPatients = partialRes.entries;
            partialPatients = partialPatients.filter((patient) => {
                return patient.recordValueId !== currentEntry.recordValueId;
            });

            //C.addJsonToSummary(partialPatients);

            if (partialPatients && partialPatients.length > 0) {
                partialMatch = true;
                triggerCreateAppointment = true;
                partialMatchPatients = partialPatients.map(
                    (patient) => patient.recordValueId
                );
            }
        }
        // Filter out patients where both the first name and last name do not match, ignoring case and spaces

        if (patients.length > 0) {
            // Exact Match Found
            triggerCreateAppointment = true;
            C.addJsonToSummary({ matchFound: patients });
            try {
                // if (currentEntry.recordValueId != 1310012) {
                //     return;
                // }
                selectedPatientId = patients[0].recordValueId;
                if (+selectedPatientId === +currentEntry.recordValueId) {
                    C.addJsonToSummary({
                        mssg:
                            "You cannot choose same patient for merging process.",
                    });
                    return;
                }

                let currentPatient = currentEntry;

                const duplicatePatient = await C.getEntry({
                    recordInternalId: "dental2you-patients",
                    entryId: +selectedPatientId,
                });

                C.addJsonToSummary(duplicatePatient);

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

                const attachments = currentPatient["attachments"] || [];

                C.addJsonToSummary(attachments);
                const duplicatePatientAttachments =
                    duplicatePatient["attachments"] || [];

                C.addJsonToSummary(duplicatePatientAttachments);

                const mergedAttachments = [
                    ...attachments,
                    ...duplicatePatientAttachments,
                ];

                C.addJsonToSummary(mergedAttachments);

                const allAllergies =
                    currentPatient["1188947-allergy-options"] || [];
                const duplicatePatientAllAllergies =
                    duplicatePatient["1188947-allergy-options"] || [];
                const mergedAllergies = [
                    ...allAllergies,
                    ...duplicatePatientAllAllergies,
                ];

                let currentAllergies = currentPatient["allergies"] || "";
                let existingAllergies = duplicatePatient["allergies"] || "";
                if (currentAllergies.length > 0) {
                    existingAllergies = `${currentAllergies} \n
                    ${duplicatePatient["allergies"]}
                `;
                }

                let currentMedicalConditions =
                    currentPatient["medical-conditions"] || "";
                let existingMedicalConditions =
                    duplicatePatient["medical-conditions"] || "";
                if (currentMedicalConditions.length > 0) {
                    existingMedicalConditions = `${currentMedicalConditions} \n
                    ${duplicatePatient["medical-conditions"]}
                `;
                }

                let updateValue = {
                    ...valuesToBeOverride,
                    attachments: mergedAttachments,
                    "1188947-allergy-options": mergedAllergies || [],
                    allergies: existingAllergies || "",
                    "medical-conditions": existingMedicalConditions || "",
                };

                C.addJsonToSummary(updateValue);

                await C.updateEntries({
                    updates: [
                        {
                            value: {
                                ...valuesToBeOverride,
                                attachments: mergedAttachments,
                                "1188947-allergy-options":
                                    mergedAllergies || [],
                                allergies: existingAllergies || "",
                                "medical-conditions":
                                    existingMedicalConditions || "",
                            },
                            entryId: +selectedPatientId,
                            recordInternalId: "dental2you-patients",
                        },
                    ],
                });
                // return C.addJsonToSummary({
                //     mssg: "Merge process completed",
                // });
            } catch (err) {
                C.log({ err });
                return C.addJsonToSummary({
                    mssg: "Merge process failed:" + err,
                });
            }
        }

        const centre = currentEntry.centre || [];
        const mobile = currentEntry.mobile || "";
        const fullName = currentEntry["full-name"] || "";

        if (!centre && centre.length === 0) {
            return {
                message: `${fullName}'s Centre is empty. Select a Centre and click the Auto Allocate Patient button again.`,
            };
        }

        if (triggerCreateAppointment) {
            const centreDetails = await C.getEntry({
                recordInternalId: "dental2you-locations",
                entryId: centre[0],
                loadAssociations: true,
                associations: [
                    {
                        internalId: "dental2you-appointments",
                        responseType: "iov",
                    },
                ],
            });

            const centreName = centreDetails.name;
            const associatedVisits =
                centreDetails.associations["dental2you-appointments"];

            //C.addJsonToSummary({ associatedVisits });

            //const today = new Date();
            // const today = moment().tz("Australia/Brisbane").startOf("day");
            // const todayDate = today.toDate();
            // const futureVisit = associatedVisits.find(
            //     (visit) => new Date(visit["start-time"]) >= todayDate
            // );

            // GET FUTURE DATE LOGIC
            const today = moment.tz(companyTimeZone).startOf("day").format();
            // Sort associatedVisits by 'start-time'
            associatedVisits.sort((a, b) => {
                let startA = moment(a["start-time"])
                    .tz(companyTimeZone)
                    .valueOf();
                let startB = moment(b["start-time"])
                    .tz(companyTimeZone)
                    .valueOf();
                return startA - startB;
            });

            const futureVisit = associatedVisits.find((visit) => {
                let visitStartTime = moment(visit["start-time"])
                    .tz(companyTimeZone)
                    .format();
                let visitEndTime = moment(visit["end-time"])
                    .tz(companyTimeZone)
                    .format(); // Assuming visits have an "end-time"

                // Get the current time in the same time zone
                let currentTime = moment().tz(companyTimeZone).format();

                // C.addJsonToSummary({
                //     visitStartTime: visitStartTime,
                //     visitEndTime: visitEndTime,
                //     currentTime: currentTime,
                // });

                // Check if the current time is before the end time of the visit
                // Only return the visit if it hasn't ended yet
                return visitEndTime >= currentTime;
            });

            if (!futureVisit) {
                await C.updateEntries({
                    updates: [
                        {
                            recordInternalId: "dental2you-patients",
                            entryId: currentEntry.recordValueId,
                            value: { "1188947-no-centre-visit-found": true },
                        },
                    ],
                });

                return {
                    message: `There's no future visit associated in ${centreName}. Create a future visit and click the Auto Allocate Patient button again.`,
                };
            }
            C.addJsonToSummary({ futureVisit });

            const dentist = futureVisit.dentist || [];
            const dentalAssistant = futureVisit["dental-assistant"] || [];
            const startTime = futureVisit["start-time"];
            const endTime = futureVisit["end-time"];
            const startTimeAEST =
                moment.tz(startTime, "Australia/Sydney").format("YYYY-MM-DD") ||
                "";
            const endTimeAEST =
                moment.tz(endTime, "Australia/Sydney").format("YYYY-MM-DD") ||
                "";

            // Calculate the day of the week
            const dayOfWeek = moment(startTimeAEST)
                .tz("Australia/Sydney")
                .format("dddd"); // e.g., "Monday"

            // Find the ID corresponding to the day of the week
            const dayOfWeekIdMapping = {
                Monday: 720141,
                Tuesday: 720138,
                Wednesday: 720137,
                Thursday: 720139,
                Friday: 720143,
                Saturday: 720142,
                Sunday: 720140,
            };
            const dayOfWeekId = dayOfWeekIdMapping[dayOfWeek];

            // Check if the day is included in the currentEntry["1188947-days-attending"]
            const attendingDaysIds =
                currentEntry["1188947-days-attending"] || [];
            const isAttendingOnDay = attendingDaysIds.includes(dayOfWeekId);

            // If the child is not attending on that day, set the checkbox

            const patientAppointmentName = `${fullName} - ${centreName} - ${moment
                .tz(startTime, "Australia/Sydney")
                .format("MMMM DD, YYYY")}`;

            const appointmentValues = {
                visit: [futureVisit.recordValueId],
                patient: [selectedPatientId],
                centre: [centre[0]],
                dentist: dentist,
                "dental-assistant": dentalAssistant,
                date: startTimeAEST,
                "end-date": endTimeAEST,
                phone: mobile,
                name: patientAppointmentName,
                "1188947-date-created": moment()
                    .tz("Australia/Sydney")
                    .format("YYYY-MM-DD"),
            };

            if (!isAttendingOnDay) {
                appointmentValues["1188947-not-regular-day-attendance"] = true;
            }

            if (patients && patients.length > 0) {
                appointmentValues["1188947-merged-appointment"] = true;
            }

            if (partialMatch) {
                appointmentValues["1188947-partial-match-found"] = true;
                appointmentValues[
                    "1188947-partial-match-patients"
                ] = partialMatchPatients;
            }

            C.addJsonToSummary({ Here5: appointmentValues });
            if (!triggerCreateAppointment) {
                return {};
            }
            let createAppointment;

            // try {
            //     createAppointment = await C.createEntry({
            //         value: appointmentValues,
            //         recordInternalId: "dental2you-patient-appointments",
            //         options: {
            //             returnRecordInfo: true,
            //             makeAutoId: true,
            //         },
            //     });

            //     createdAppointmentId = createAppointment.success[0].id;

            //     C.log(
            //         "Successfully created appointment--> ",
            //         createdAppointmentId
            //     );
            // } catch (e) {
            //     C.log("Err created appointment--> ", e);
            //     return;
            // }

            try {
                createAppointment = await C.createEntry({
                    value: appointmentValues,
                    recordInternalId: "dental2you-patient-appointments",
                    options: {
                        returnRecordInfo: true,
                        makeAutoId: true,
                    },
                });

                if (createAppointment && createAppointment.success.length > 0) {
                    createdAppointmentId = createAppointment.success[0].id;
                    C.log(
                        "Successfully created appointment--> ",
                        createdAppointmentId
                    );
                } else {
                    C.log("Error: No appointment created.");
                    return { Error: "Failed to create appointment" };
                }
            } catch (e) {
                C.log("Error creating appointment--> ", e);
                return { Error: e.message };
            }
        }

        if (createdAppointmentId) {
            await C.updateEntries({
                updates: [
                    {
                        recordInternalId: "dental2you-patients",
                        entryId: currentEntry.recordValueId,
                        value: { "1188947-appointment-created": true },
                    },
                ],
            });
        } else {
            return { Error: "Error creating Appointment" };
        }

        return C.addJsonToSummary({
            currentEntry,
            res,
            patients,
        });
    } catch (error) {
        C.log(error);
        C.addJsonToSummary({ error });
    }

    return;
}
