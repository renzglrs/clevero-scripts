async function script(C) {
    // Get the current entry data
    const currentEntry = await C.getCurrentEntry();
    const startDate = currentEntry["2580357-start-date"];
    const endDate = currentEntry["2580357-end-date"];

    //C.addJsonToSummary({ message: "Starting CSV Generation Script" });

    // Get all relevant sessions that fall between the start and end date
    const { entries: sessions } = await C.getEntries({
        filter: [
            [
                {
                    requestType: "i",
                    subject: "session-date",
                    type: "date",
                    operator: "within",
                    value: {
                        from: { relative: false, value: startDate },
                        to: { relative: false, value: endDate },
                    },
                },
            ],
        ],
        limit: 5000,
        recordInternalId: "dex-sessions",
    });

    // Define the mapping of topics
    const topicMapping = {
        "Abuse/Neglect/Violence": 2662305,
        "Access to non NDIS service": 2662306,
        "Child Protection": 2662308,
        "Community Inclusion - Social/Family": 2662307,
        "Discrimination/rights": 2662310,
        "Education": 2662311,
        "Employment": 2662312,
        "Finances": 2662314,
        "Health/ Mental Health": 2662316,
        "Housing/Homelessness": 2662317,
        "Legal/Access to Justice including guardianship/SAT": 2662318,
        Transport: 2662324,
        "Vulnerable/isolated": 2662325,
        OTHER: 200487824,
    };

    // Initialize CSV data with headers
    let csvData = [["Nature of issue", "Count"].join(",")];

    // Loop through each topic in the mapping
    for (let [topicName, topicId] of Object.entries(topicMapping)) {
        // Step 1: Collect unique case IDs first
        const uniqueCases = new Set(sessions.map((session) => session.case[0])); // Get unique case IDs

        // Step 2: Filter the sessions by topic
        const filteredSessions = sessions.filter(
            (session) =>
                uniqueCases.has(session.case[0]) &&
                session["2580357-topic"] == topicId
        );

        // Get the count of unique cases for the filtered sessions
        const finalUniqueCases = new Set(
            filteredSessions.map((session) => session.case[0])
        );
        const sessionsByTopic = finalUniqueCases.size;

        // Add data for each topic to the CSV
        csvData.push([topicName, sessionsByTopic].join(","));
    }

    // Convert array of rows into a CSV string
    const csvContent = csvData.join("\n");

    // Generate the CSV file using C.generateFile
    const fileResponse = await C.generateFile({
        filename:
            "Primary Issues-" +
            moment(startDate).format("MMM DD, YYYY") +
            " - " +
            moment(endDate).format("MMM DD, YYYY"),
        extension: "csv",
        contentType: "text/csv",
        content: csvContent,
    });

    // Attach the generated file to the entry
    const entryDetails = {
        entryId: currentEntry.recordValueId,
        recordInternalId: "people-with-disabilities-wa-inc-doc-reporting",
    };

    const updateResponse = await C.updateEntries({
        updates: [
            {
                value: { "2580357-atatchments": [fileResponse] },
                valuesType: "iov",
                ...entryDetails,
            },
        ],
    });

    // Show a download link or button for the generated CSV file
    await C.downloadFiles({
        name: "GeneratedCSVFile",
        ...entryDetails,
        fieldIds: ["2580357-atatchments"], // Attach file to field
    });

    // // Redirect back to the entry
    // return C.addRedirect(
    //     `/app/records/2712773/view/${currentEntry.recordValueId}`
    // );
}
