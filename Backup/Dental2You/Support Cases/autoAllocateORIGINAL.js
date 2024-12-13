async function script(C) {
    const currentEntry = await C.getCurrentEntry();
    const {
        timezone: companyTimeZone = "Australia/Sydney",
    } = await C.getCompanySettings();

    const centre = currentEntry.centre || [];
    const mobile = currentEntry.mobile || "";
    const fullName = currentEntry["full-name"] || "";
    const isDentalAppointment = currentEntry["1188947-is-dental"] || false;
    const isOpticalAppointment = currentEntry["1188947-is-optical"] || false;

    if (centre.length === 0) {
        return {
            message: `${fullName}'s Centre is empty. Select a Centre and click the Auto Allocate Patient button again.`,
        };
    }

    const centreDetails = await C.getEntry({
        recordInternalId: "dental2you-locations",
        entryId: centre[0],
        loadAssociations: true,
        associations: [
            { internalId: "dental2you-appointments", responseType: "iov" },
        ],
    });

    const centreName = centreDetails.name;
    const associatedVisits =
        centreDetails.associations["dental2you-appointments"];

    const today = moment.tz(companyTimeZone).startOf("day").format();

    // Sort associatedVisits by 'start-time'
    associatedVisits.sort((a, b) => {
        let startA = moment(a["start-time"]).tz(companyTimeZone).valueOf();
        let startB = moment(b["start-time"]).tz(companyTimeZone).valueOf();
        return startA - startB;
    });

    // Find the nearest future visit for a specific visit type
    function findNearestVisit(visitType) {
        return associatedVisits.find((visit) => {
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
    }

    // Create appointment function
    async function createAppointment(futureVisit, appointmentType, typeLabel) {
        if (!futureVisit) {
            return {
                message: `There's no future visit of type ${typeLabel} in ${centreName}. Create a future visit and click the Auto Allocate Patient button again.`,
            };
        }

        const dentist = futureVisit.dentist || [];
        const dentalAssistant = futureVisit["dental-assistant"] || [];
        const startTime = futureVisit["start-time"];
        const endTime = futureVisit["end-time"];
        const startTimeAEST =
            moment.tz(startTime, "Australia/Sydney").format("YYYY-MM-DD") || "";
        const endTimeAEST =
            moment.tz(endTime, "Australia/Sydney").format("YYYY-MM-DD") || "";
        const patientAppointmentName = `${fullName} - ${centreName} - ${moment
            .tz(startTime, "Australia/Sydney")
            .format("MMMM DD, YYYY")}`;

        const appointmentValues = {
            visit: [futureVisit.recordValueId || []],
            patient: [currentEntry.recordValueId || []],
            centre: [centreDetails.recordValueId || []],
            dentist: dentist,
            "dental-assistant": dentalAssistant,
            "1188947-appointment-type": appointmentType,
            date: startTimeAEST,
            "end-date": endTimeAEST,
            phone: mobile,
            name: patientAppointmentName,
        };

        C.addJsonToSummary({ appointmentValues });

        const createAppointment = await C.createEntry({
            value: appointmentValues,
            recordInternalId: "dental2you-patient-appointments",
            options: {
                returnRecordInfo: true,
                makeAutoId: true,
            },
        });

        const createdAppointmentId = createAppointment.success[0]?.id;

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

            // C.addRedirect(`/app/records/1198026/view/${createdAppointmentId}`);
        }

        return {
            message: `Appointment ${createdAppointmentId} for ${typeLabel} has been successfully created.`,
        };
    }

    // Handle Dental Appointment Creation
    if (isDentalAppointment) {
        const futureDentalVisit = findNearestVisit(200806219);
        await createAppointment(futureDentalVisit, [200806219], "Dental");
    }

    // Handle Optical Appointment Creation
    if (isOpticalAppointment) {
        const futureOpticalVisit = findNearestVisit(200806226);
        await createAppointment(futureOpticalVisit, [200806226], "Optical");
    }

    // If no appointments were selected
    if (!isDentalAppointment && !isOpticalAppointment) {
        return {
            message: `No appointment type selected. Please check either Dental or Optical appointment and try again.`,
        };
    }
}

