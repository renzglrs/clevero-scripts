async function script(C) {
  const headers = {
    Authorization: "Bearer 35ftLsAfKZbQisnBqgzfATxsqmQ",
    "Content-Type": "application/json",
  };
  const practiceId = "4ab77a0a-3217-44bc-9de5-f127c21a5d54";
  const recepientId = "bde5dcdc-bc80-4790-a47e-0b770004e860";

  // Step 1: Fetch notes entries with filter
  let notesEntries = await C.filterEntries({
    filter: [
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
      ],
    ],
    limit: 2000,
    recordInternalId: "hello-mello-notes",
  });

  const filteredNotesEntries = notesEntries.entries || [];
  if (filteredNotesEntries.length === 0) {
    return { message: "No note entry filtered" };
  }

  C.addJsonToSummary({ notesCount: filteredNotesEntries.length });

  // Helper function for processing each entry
  const processEntry = async (entry) => {
    try {
      const patientId = entry["1614495-patient"]?.[0];
      if (!patientId) throw new Error("Patient ID is missing");

      const patientObject = await C.getEntry({
        entryId: patientId,
        recordInternalId: "hello-mello-patients",
      });
      const medirecordsId = patientObject["1614495-medirecords-id"];
      if (!medirecordsId) throw new Error("Medirecords ID is missing");

      const notePdfFileKey = entry["1614495-note-pdf"]?.[0]?.key;
      if (!notePdfFileKey) throw new Error("PDF file key is missing");

      // Prepare form data
      const form = new FormData();
      form.append("subject", "Historical Note");
      form.append("practiceId", practiceId);
      form.append("patientId", medirecordsId);
      form.append("importDate", moment().format("YYYY-MM-DD"));
      form.append("category", "1");
      form.append("senderType", "2");
      form.append("senderId", practiceId);
      form.append("recipientId", recepientId);

      await C.attachFileToFormData({
        formData: form,
        formDataKey: "attachment",
        fileKey: notePdfFileKey,
      });

      const endPoint = `https://api.medirecords.com/v1/upload/patients/${medirecordsId}/correspondences/inbounds`;
      const response = await axios.post(endPoint, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: headers.Authorization,
        },
      });

      return {
        success: true,
        entryId: entry.recordValueId,
        response: response.data,
        update: {
          recordInternalId: "hello-mello-notes",
          entryId: entry.recordValueId,
          value: { "1614495-sent-to-medirecords": true },
        },
      };
    } catch (error) {
      return {
        success: false,
        entryId: entry.recordValueId,
        error: error.message,
      };
    }
  };

  // Batch processing with throttling
  const batchSize = 5; // Number of concurrent requests
  const delayMs = 6000; // Delay between batches (in milliseconds)
  const results = [];

  for (let i = 0; i < filteredNotesEntries.length; i += batchSize) {
    const batch = filteredNotesEntries.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processEntry));
    results.push(...batchResults);

    // Add a delay before the next batch
    if (i + batchSize < filteredNotesEntries.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const successfulResponses = results.filter((r) => r.success);
  const failedResponses = results.filter((r) => !r.success);

  // Step 4: Update entries in batch
  const updates = successfulResponses.map((r) => r.update);
  if (updates.length > 0) {
    await C.updateEntries({ updates });
  }

  C.addJsonToSummary({
    successfulResponses,
    failedResponses,
  });

  return {
    message: "Script execution completed",
    successfulResponses,
    failedResponses,
  };
}
