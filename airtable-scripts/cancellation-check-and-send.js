let inputConfig = input.config();
let recordId = inputConfig.recordId;

let table = base.getTable("Appointments");
let record = await table.selectRecordAsync(recordId);

if (!record) {
    console.log("Record not found:", recordId);
} else {
    let sendAt = record.getCellValue("Cancellation Webhook Send At");
    let alreadySent = record.getCellValue("Cancellation Webhook Sent");
    let now = new Date();
    let sendAtDate = sendAt ? new Date(sendAt) : null;
    let fiveMinMs = 5 * 60 * 1000;

    if (alreadySent) {
        console.log("Already sent, skipping:", recordId);
    } else if (sendAtDate && (now.getTime() - sendAtDate.getTime()) >= fiveMinMs) {
        let response = await fetch("https://client.pawsonlongmeadow.com/cancellation-confirmed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recordId: recordId })
        });
        console.log("Webhook response status:", response.status, "for record", recordId);
    } else {
        console.log("Not yet 5 minutes, skipping:", recordId);
    }
}
