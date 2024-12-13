async function script(C) {
  let currentTourEntry = await C.getCurrentEntry();
  let currentEntry = await C.getEntry({
    recordInternalId: "life-tours",
    entryId: currentTourEntry.recordValueId,
    loadAssociations: true,
    associations: [
      {
        internalId: "life-expenses",
        responseType: "iov",
      },
      {
        internalId: "life-bookings",
        responseType: "iov",
      },
    ],
  });

  C.addJsonToSummary({ currentTourEntry });

  const associatedExpense = currentEntry.associations["life-expenses"];
  const associatedBookings = currentEntry.associations["life-bookings"];

  let updateEntries = [];
  let finalTotalValue = 0;
  let finalTotalRevenue = 0;
  let finalTotalExpense = 0;

  // For Updating tour revenue field
  if (associatedBookings.length > 0) {
    C.log("Associated Bookings:", associatedBookings);

    // Filter out cancelled bookings by status ID
    const filteredBookingTotalValue = associatedBookings
      .filter((entry) => {
        const isNotCancelledOrOnHold = entry["status"] != 172423 && entry["status"] != 172424;
        C.log(
          `Booking ID ${entry["id"]} - Status: ${entry["status"]} - Included: ${isNotCancelledOrOnHold}`
        );
        return isNotCancelledOrOnHold;
      })
      .map((entry) => entry["bookings-subtotal"] || 0);

    if (filteredBookingTotalValue.length > 0) {
      finalTotalValue = filteredBookingTotalValue.reduce((acc, val) => acc + val);

      updateEntries.push({
        value: {
          "tour-revenue": +finalTotalValue.toFixed(2),
        },
        entryId: currentEntry.recordValueId,
        recordInternalId: "life-tours",
      });

      finalTotalRevenue = +finalTotalValue.toFixed(2);
    } else {
      updateEntries.push({
        value: {
          "tour-revenue": finalTotalValue,
        },
        entryId: currentEntry.recordValueId,
        recordInternalId: "life-tours",
      });

      finalTotalRevenue = +finalTotalValue;
    }
  }

  C.addJsonToSummary({ totalRevenue: finalTotalValue });

  // For updating expenses total field
  if (associatedExpense.length > 0) {
    C.log("Associated expense is present");
    const filteredExpenseTotalValue = associatedExpense.map((entry) => {
      return entry["expense-total"] || 0;
    });

    if (filteredExpenseTotalValue.length > 0) {
      finalTotalValue = filteredExpenseTotalValue.reduce((acc, val) => acc + val);

      updateEntries.push({
        value: {
          "expenses-total": +finalTotalValue.toFixed(2),
        },
        entryId: currentEntry.recordValueId,
        recordInternalId: "life-tours",
      });

      finalTotalExpense = +finalTotalValue.toFixed(2);
    } else {
      updateEntries.push({
        value: {
          "expenses-total": finalTotalValue,
        },
        entryId: currentEntry.recordValueId,
        recordInternalId: "life-tours",
      });

      finalTotalExpense = +finalTotalValue;
    }
  }

  C.addJsonToSummary({ totalExpense: finalTotalValue });

  C.addJsonToSummary({ updateEntries: updateEntries });

  const updateTourEntry = await C.updateEntries({
    updates: updateEntries,
  });

  // For updating profit/loss
  const updatedEntry = await C.getEntry({
    recordInternalId: "life-tours",
    entryId: currentEntry.recordValueId,
  });

  const areaId = updatedEntry.area && updatedEntry.area[0];
  let isTourOverSeas = false;

  if (areaId) {
    const area = await C.getEntry({
      entryId: +areaId,
      recordInternalId: "laa-area-131-1623909515076",
    });

    isTourOverSeas = area["122601-isoverseas"] === "true" || area["122601-isoverseas"] === true;
  }

  const bookingV = +updatedEntry["tour-revenue"] || 0;
  const expenseV = +updatedEntry["expenses-total"] || 0;
  const staffingV = +updatedEntry["staffing-expense"] || 0;
  //C.addJsonToSummary(bookingV, expenseV, staffingV);
  const gstBase = isTourOverSeas ? 0 : +bookingV - +expenseV;
  //C.log("gstBase--> ", gstBase);
  const gst = isTourOverSeas ? 0 : +gstBase / 11;

  let profitLoss = bookingV - expenseV - staffingV - gst;

  await C.updateEntries({
    updates: [
      {
        value: {
          "profit-loss": +profitLoss.toFixed(2),
          "122601-gst": +gst.toFixed(2),
          "122601-tour-profit-percent": (
            (+profitLoss.toFixed(2) / bookingV.toFixed(2)) *
            100
          ).toFixed(1),
          "net-income": +gstBase.toFixed(2),
        },
        entryId: currentEntry.recordValueId,
        recordInternalId: "life-tours",
      },
    ],
  });

  C.addRedirect(`/app/records/122844/view/${currentEntry.recordValueId}`);

  return {
    finalTotalRevenue,
    finalTotalExpense,
    finalTotalProfitLoss: profitLoss,
    finalTotalStaffingExpense: staffingV,
    finalTotalGst: gst,
    finalTotalGstBase: gstBase,
  };
}
