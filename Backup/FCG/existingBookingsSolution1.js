async function handler(C) {
    try {
        let actions = [];
        // Get psychologist value
        const psychologistValue = C.getValue("1795685-psychologists");

        if (!psychologistValue) {
            console.error("No psychologist selected");
            return;
        }

        // Define filters for fetching appointments
        const filters = [
            {
                subject: "18339", // Assuming this is the field for psychologist ID
                responseType: "i",
                type: "array",
                operator: "any_of",
                ignoreCase: true,
                value: psychologistValue,
            },
            "and",
            {
                subject: "18362",
                type: "array",
                operator: "any_of",
                ignoreCase: true,
                value: ["1851314"],
            },
        ];

        // Fetch appointments for the psychologist
        const psychologistAppointments = await C.api.listEntries({
            internalId: "ferrari-consulting-group-appointments",
            filter: filters,
            responseType: "iov",
        });

        const existingAppointments = psychologistAppointments.entries || [];

        // Get the new appointment's start and end time
        const newAppointment = {
            startTime: C.getValue("1795685-start-time"),
            endTime: C.getValue("1795685-end-time"),
        };

        // Validate new appointment times
        if (!newAppointment.startTime || !newAppointment.endTime) {
            console.error("Missing start or end time for the new appointment");
            return;
        }

        // Check for time conflicts
        const conflict = checkBookingConflict(newAppointment, existingAppointments);
        if (conflict) {
            console.log("Conflict detected: Cannot save the appointment.");
            if (conflict.startTimeConflict) {
                actions.push(C.setFieldError("1795685-start-time", true));
                actions.push(
                    C.setFieldErrorText(
                        "1795685-start-time",
                        "There is already a booking for this psychologist at the selected start time."
                    )
                );
            }

            if (conflict.endTimeConflict) {
                actions.push(C.setFieldError("1795685-end-time", true));
                actions.push(
                    C.setFieldErrorText(
                        "1795685-end-time",
                        "There is already a booking for this psychologist at the selected end time."
                    )
                );
            }

            return C.mergeAll(actions); // Stop further processing to prevent saving
        }

        // If no conflicts, proceed to save the appointment
        console.log("No conflicts detected. Proceeding to save...");

        // Actual save logic
        const saveResponse = await C.api.saveEntry(newAppointment); // Adjust this line as needed
        console.log("Appointment saved successfully:", saveResponse);
    } catch (error) {
        console.error("An error occurred in the handler:", error);
    }

    function checkBookingConflict(newBooking, existingAppointments) {
        const newStartTime = C.moment(newBooking.startTime);
        const newEndTime = C.moment(newBooking.endTime);

        let conflict = { startTimeConflict: false, endTimeConflict: false };

        for (const booking of existingAppointments) {
            const existingStartTime = C.moment(booking["1795685-start-time"]);
            const existingEndTime = C.moment(booking["1795685-end-time"]);

            // Check if new appointment start time overlaps with existing booking
            if (newStartTime.isBetween(existingStartTime, existingEndTime, null, "[)")) {
                conflict.startTimeConflict = true;
            }

            // Check if new appointment end time overlaps with existing booking
            if (newEndTime.isBetween(existingStartTime, existingEndTime, null, "(]")) {
                conflict.endTimeConflict = true;
            }

            // Check if new booking completely overlaps an existing booking
            if (
                newStartTime.isSameOrBefore(existingStartTime) &&
                newEndTime.isSameOrAfter(existingEndTime)
            ) {
                conflict.startTimeConflict = true;
                conflict.endTimeConflict = true;
            }

            if (conflict.startTimeConflict || conflict.endTimeConflict) {
                console.log("Conflict found with booking:", booking);
                return conflict; // Conflict found
            }
        }

        return false; // No conflicts
    }
}
