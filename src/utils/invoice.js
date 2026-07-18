import PDFDocument from "pdfkit";
import { formatCurrency } from "./common.js";

export const buildInvoicePdf = async ({ payment, course, user }) =>
  new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(22).text("CourseForge Receipt");
    doc.moveDown();
    doc.fontSize(11).text(`Invoice: ${payment.invoiceNumber}`);
    doc.text(`Order: ${payment.orderNumber}`);
    doc.text(`Date: ${new Date(payment.createdAt).toLocaleString()}`);
    doc.moveDown();
    doc.text(`Customer: ${user.name}`);
    doc.text(`Email: ${user.email}`);
    doc.moveDown();
    doc.text(`Course: ${course.title}`);
    doc.text(`Status: ${payment.status}`);
    doc.text(`Payment Ref: ${payment.transactionReference || payment.razorpayPaymentId || "-"}`);
    doc.moveDown();
    doc.text(`Subtotal: ${formatCurrency(payment.subtotalAmount, payment.currency)}`);
    doc.text(`Discount: ${formatCurrency(payment.discountAmount, payment.currency)}`);
    doc.fontSize(14).text(`Total Paid: ${formatCurrency(payment.totalAmount, payment.currency)}`);
    doc.end();
  });

