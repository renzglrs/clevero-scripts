async function script(C) {
    const currentEntry = await C.getCurrentEntry();
    const {
        timezone: companyTimeZone = "Australia/Sydney",
    } = await C.getCompanySettings();

    const centre = currentEntry.centre || [];
    const mobile = currentEntry.mobile || "";
    const fullName = currentEntry["full-name"] || "";

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

    // C.addJsonToSummary({ associatedVisits });
    
    // const today = moment.tz("Australia/Brisbane").startOf("day").format();
    // const currentTime = moment.tz("Australia/Brisbane").format();
    // // C.log("today:" + today);
    // // C.log("currentTime:" + currentTime);
    // const futureVisit = associatedVisits.find((visit) => {
    //     const visitStart = moment(visit["start-time"])
    //         .tz("Australia/Brisbane")
    //         .format();
    //     const visitEnd = moment(visit["end-time"])
    //         .tz("Australia/Brisbane")
    //         .format();
    //     // C.log("visitStart:" + visitStart);
    //     // C.log("visitEnd:" + visitEnd);
    //     // C.log(visitStart.substring(0, 10));
    //     // C.log(today.substring(0, 10));
    //     if (visitStart.substring(0, 10) === today.substring(0, 10)) {
    //         return visitEnd > currentTime;
    //     }

    //     return visitStart > today;
    // });

    // const today = moment.tz("Australia/Brisbane").startOf("day").format();
    // const today = moment.tz(companyTimeZone).startOf("day").format();

    // const futureVisit = associatedVisits.find((visit) => {
    //     let visitDate = moment(visit["start-time"])
    //         .tz("Australia/Brisbane")
    //         .format();

    //     C.addJsonToSummary({
    //         visitDate,
    //         today,
    //     });

    //     return visitDate >= today;
    // });

    const today = moment.tz(companyTimeZone).startOf("day").format();

    // Sort associatedVisits by 'start-time'
    associatedVisits.sort((a, b) => {
        let startA = moment(a["start-time"]).tz(companyTimeZone).valueOf();
        let startB = moment(b["start-time"]).tz(companyTimeZone).valueOf();
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

        C.addJsonToSummary({
            visitStartTime: visitStartTime,
            visitEndTime: visitEndTime,
            currentTime: currentTime,
        });

        // Check if the current time is before the end time of the visit
        // Only return the visit if it hasn't ended yet
        return visitEndTime >= currentTime;
    });

    if (!futureVisit) {
        return {
            message: `There's no future visit associated in ${centreName}. Create a future visit and click the Auto Allocate Patient button again.`,
        };
    }

    const dentist = futureVisit.dentist || [];
    const dentalAssistant = futureVisit["dental-assistant"] || [];
    const appointmentType = futureVisit["1188947-visit-type"] || [];
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

    // return;

    const createAppointment = await C.createEntry({
        value: appointmentValues,
        recordInternalId: "dental2you-patient-appointments",
        options: {
            returnRecordInfo: true,
            makeAutoId: true,
        },
    });

    const createdAppointmentId = createAppointment.success[0]?.id;

    C.log("Successfully created appointment--> ", createdAppointmentId);

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

        C.addRedirect(`/app/records/1198026/view/${createdAppointmentId}`);
    }

    return {
        message: `Appointment ${createdAppointmentId} has been successfully created.`,
    };
}
