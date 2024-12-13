async function script(C) {
  let notesEntries = await C.filterEntries({
    filter: [
      {
        subject: "id",
        type: "number:recordValue",
        operator: "any_of",
        value: [200879554],
      },
      "and",
      {
        subject: "1614495-note-tag",
        requestType: "i",
        type: "text",
        operator: "equals",
        ignoreCase: true,
        value: "Historical Note",
      },
      "and",
      {
        subject: "1614495-note-pdf",
        requestType: "i",
        type: "array",
        operator: "not_empty",
        ignoreCase: true,
      },
      "and",
      [
        {
          subject: "1614495-sent-to-medirecords",
          requestType: "i",
          type: "checkbox",
          operator: "is_empty",
          ignoreCase: true,
        },
        "or",
        {
          subject: "1614495-sent-to-medirecords",
          requestType: "i",
          type: "checkbox",
          operator: "is_false",
          ignoreCase: true,
        },
        ,
      ],
    ],
    limit: 1,
    recordInternalId: "hello-mello-notes",
  });

  C.addJsonToSummary({
    notesEntries,
    notesCount: notesEntries.length,
  });

  const filteredNotesEntries = notesEntries.entries;

  if (filteredNotesEntries && !filteredNotesEntries.length > 0)
    return { message: "No note entry filtered" };

  C.addJsonToSummary({
    filteredNotesEntries: filteredNotesEntries,
  });

  //return;

  //let endPoint = "https://api.medirecords.com/v1/notes";

  const headers = {
    Authorization: "Bearer 35ftLsAfKZbQisnBqgzfATxsqmQ",
    "Content-Type": "application/json",
  };

  // Use this

  let updateEntries = [];
  let overallResponse = [];

  for (entry of filteredNotesEntries) {
    let currentEntry = entry;
    C.addJsonToSummary({ id: currentEntry.recordValueId });

    const patientId = currentEntry["1614495-patient"];
    const patientObject = await C.getEntry({
      entryId: patientId[0],
      recordInternalId: "hello-mello-patients",
    });
    const medirecordsId = patientObject["1614495-medirecords-id"];
    C.addJsonToSummary({ id: medirecordsId });
    const practiceId = "4ab77a0a-3217-44bc-9de5-f127c21a5d54";
    const recepientId = "bde5dcdc-bc80-4790-a47e-0b770004e860";

    const form = new FormData();
    form.append("subject", "Historical Note");
    form.append("practiceId", practiceId);
    form.append("patientId", medirecordsId);
    //form.append("1614495-note-pdf", currentEntry["1614495-note-pdf"]);
    form.append("importDate", moment().format("YYYY-MM-DD"));
    form.append("category", "1");
    form.append("senderType", "2");
    form.append("senderId", practiceId);
    form.append("recipientId", recepientId);

    const notePdfFileKey = _.get(currentEntry, ["1614495-note-pdf", 0, "key"]);

    if (notePdfFileKey) {
      const correspondenceFileResponse = await C.attachFileToFormData({
        formData: form,
        formDataKey: "attachment",
        fileKey: notePdfFileKey,
      });

      /* C.addJsonToSummary({
                fileResponse,
                correspondenceFileResponse,
            });*/

      const endPoint =
        "https://api.medirecords.com/v1/upload/patients/" +
        medirecordsId +
        "/correspondences/inbounds";
      C.addJsonToSummary(form);

      try {
        const response = await axios.post(endPoint, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: "Bearer 35ftLsAfKZbQisnBqgzfATxsqmQ",
          },
        });
        C.log("response-->", response.data);
        // C.addJsonToSummary({ response: response.data });
        if (response) {
          updateEntries.push({
            recordInternalId: "hello-mello-notes",
            entryId: currentEntry.recordValueId,
            value: {
              "1614495-sent-to-medirecords": true,
            },
          });
          overallResponse.push(response.data);
        }
      } catch (e) {
        C.log("response-->", response.data);
        C.log("error-->", e);
        C.log(`Error on entry Id: ${currentEntry.recordValueId}`);
      }
    }
  }

  C.addJsonToSummary({
    overallResponse: overallResponse,
    updateEntries: updateEntries,
  });

  const updateResponse = await C.updateEntries({
    updates: updateEntries,
  });

  return;
}
