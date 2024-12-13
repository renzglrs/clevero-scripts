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
        if (checkBookingConflict(newAppointment, existingAppointments)) {
            console.log("Conflict detected: Cannot save the appointment.");
            alert(
                "There is already a booking for this psychologist at the selected time."
            ); // Inform the user
            actions.push(C.setFieldError("1795685-start-time", true));
            actions.push(C.setFieldErrorText(
                "1795685-start-time",
                "There is already a booking for this psychologist at the selected time."
            ));
            actions.push(C.setFieldError("1795685-end-time", true));
            actions.push(C.setFieldErrorText(
                "1795685-end-time",
                "There is already a booking for this psychologist at the selected time."
            ));
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

        for (const booking of existingAppointments) {
            const existingStartTime = C.moment(booking["1795685-start-time"]);
            const existingEndTime = C.moment(booking["1795685-end-time"]);

            // Check if new appointment start time or end time falls within the existing appointment's timeframe
            if (
                newStartTime.isBetween(
                    existingStartTime,
                    existingEndTime,
                    null,
                    "[)"
                ) || // New start overlaps with existing booking
                newEndTime.isBetween(
                    existingStartTime,
                    existingEndTime,
                    null,
                    "(]"
                ) || // New end overlaps with existing booking
                (newStartTime.isSameOrBefore(existingStartTime) &&
                    newEndTime.isSameOrAfter(existingEndTime)) // New booking completely overlaps existing
            ) {
                console.log("Conflict found with booking:", booking);
                return true; // Conflict found
            }
        }

        return false; // No conflicts
    }
}

/*

    function checkBookingConflict(newBooking, existingAppointments) {
        const newStartTime = C.moment(newBooking.startTime);
        const newEndTime = C.moment(newBooking.endTime);

        for (const booking of existingAppointments) {
            const existingStartTime = C.moment(booking["1795685-start-time"]);
            const existingEndTime = C.moment(booking["1795685-end-time"]);

            // Check if there is an overlap (partial or full)
            if (
                newStartTime.isBefore(existingEndTime) && // New starts before existing ends
                newEndTime.isAfter(existingStartTime) // New ends after existing starts
            ) {
                return true; // Conflict found
            }
        }

        return false; // No conflicts
    }


    function checkBookingConflict(newBooking, existingAppointments) {
        const newStartTime = C.moment(newBooking.startTime);
        const newEndTime = C.moment(newBooking.endTime);

        // console.log("Checking for conflicts...");

        for (const booking of existingAppointments) {
            const existingStartTime = C.moment(booking["1795685-start-time"]);
            const existingEndTime = C.moment(booking["1795685-end-time"]);

            // console.log("Comparing with existing booking:", {
            //     existingStartTime,
            //     existingEndTime,
            // });

            // Check if the new booking conflicts with existing bookings
            if (
                newStartTime.isBetween(
                    existingStartTime,
                    existingEndTime,
                    null,
                    "[)"
                ) || // New start overlaps with existing booking
                newEndTime.isBetween(
                    existingStartTime,
                    existingEndTime,
                    null,
                    "(]"
                ) || // New end overlaps with existing booking
                (newStartTime.isSameOrBefore(existingStartTime) &&
                    newEndTime.isSameOrAfter(existingEndTime)) // New booking completely overlaps existing
            ) {
                console.log("Conflict found with booking:", booking);
                return true; // Conflict found
            }
        }

        return false; // No conflicts
    }
    
*/
