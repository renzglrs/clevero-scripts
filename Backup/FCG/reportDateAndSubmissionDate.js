/*
    Interaction: LIVE, Set the Report Review Date and Required Submission Date 
    Date: 2024-11-20
*/
async function handler(C) {
  try {
    const actions = [];
    const parentAppointmentValue = C.getValue("1795685-parent-appointment");
    const startTime = C.getValue("1795685-start-time");
    const isFollowUp = C.getValue("1795685-is-follow-up-appointment");
    const FOLLOW_UP_STATUS = "1142";

    const adjustToNextWeekday = (date) => {
      if (!date.isValid()) {
        throw new Error("Invalid date provided.");
      }
      return date.day() === 6 ? date.add(2, "days") : date.day() === 0 ? date.add(1, "day") : date;
    };

    if (isFollowUp[0] === FOLLOW_UP_STATUS && parentAppointmentValue) {
      try {
        const parentAppointmentEntry = await C.api.getEntry({
          recordId: "1821782",
          responseType: "iov",
          id: parentAppointmentValue,
        });

        if (parentAppointmentEntry) {
          const formatDate = (date) => C.moment(date).format("YYYY-MM-DD");
          actions.push(
            C.setValue(
              "1795685-submission-date",
              formatDate(parentAppointmentEntry["1795685-submission-date"])
            )
          );
          actions.push(
            C.setValue(
              "1795685-completion-date",
              formatDate(parentAppointmentEntry["1795685-completion-date"])
            )
          );
        } else {
          console.error("Parent appointment entry not found");
        }
      } catch (error) {
        console.error("Error retrieving parent appointment:", error);
      }
    } else {
      const startMoment = C.moment(startTime);
      let reportReviewDate = adjustToNextWeekday(startMoment.clone().add(12, "days"));
      actions.push(C.setValue("1795685-submission-date", reportReviewDate.format("YYYY-MM-DD")));

      let requiredSubmissionDate = startMoment.clone().add(11, "days"); // Old day is 14//
      let businessDaysAdded = 0;

      while (businessDaysAdded < 3) {
        requiredSubmissionDate.add(1, "day");
        if (requiredSubmissionDate.day() !== 6 && requiredSubmissionDate.day() !== 0) {
          businessDaysAdded++;
        }
      }
      console.log(businessDaysAdded);
      requiredSubmissionDate = adjustToNextWeekday(requiredSubmissionDate);
      actions.push(
        C.setValue("1795685-completion-date", requiredSubmissionDate.format("YYYY-MM-DD"))
      );
    }

    return C.mergeAll(actions);
  } catch (error) {
    console.error("Error occurred while processing dates:", error);
  }
}
