import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit-table';
import cron from 'node-cron';

dotenv.config();
const PORT = process.env.PORT || 5000;
const apiKey = process.env.API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app = express();
// const allowedOrigins = ['https://image-to-excel-pdf.vercel.app'];

// Middleware
// app.use(cors({
//     origin: function (origin, callback) {
//         if (allowedOrigins.includes(origin)) {
//             callback(null, true);
//         } else {
//             callback(new Error('Not allowed by CORS'));
//         }
//     },
// }));
app.use(cors({}));
app.use(express.static('public')); // For serving static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true })); // To parse form data
app.use(express.json()); // To parse JSON data

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ storage });

// Utility function to get MIME type
function getMimeType(filePath) {
    const extname = path.extname(filePath).toLowerCase();
    switch (extname) {
        case '.pdf':
            return 'application/pdf';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        default:
            return null;
    }
}

// Cleanup job to delete old files after 1 hour
const cleanupOldFiles = () => {
    const now = Date.now();
    const oneHour = 3600000; // 1 hour in milliseconds
    const uploadDir = path.join(__dirname, 'uploads');
    const publicDir = path.join(__dirname, 'public');

    [uploadDir, publicDir].forEach((dir) => {
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach((file) => {
                const filePath = path.join(dir, file);
                try {
                    const fileStats = fs.statSync(filePath);
                    if (now - fileStats.mtimeMs > oneHour) {
                        fs.unlinkSync(filePath);
                        console.log(`Deleted file: ${filePath}`);
                    }
                } catch (err) {
                    console.error(`Error processing file ${filePath}:`, err);
                }
            });
        }
    });
};

// Schedule the cleanup job to run every 10 minutes
cron.schedule('*/10 * * * *', cleanupOldFiles);

async function createExcelFile(data, originalFilename, title) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Extracted Data');

    if (title) {
        const titleRow = worksheet.addRow([title]);
        titleRow.eachCell({ includeEmpty: true }, (cell) => {
            cell.font = { bold: true, size: 14 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        worksheet.mergeCells(1, 1, 1, Object.keys(data[0]).length);
        worksheet.addRow([]);
    }

    const headers = Object.keys(data[0]);
    const headerRow = worksheet.addRow(headers.map((header) => header.toUpperCase()));
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { bold: true };
    });

    data.forEach((row) => {
        const excelRow = worksheet.addRow(Object.values(row));
        excelRow.eachCell({ includeEmpty: true }, (cell) => {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
    });

    worksheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            if (cell.value) {
                const length = cell.value.toString().length;
                maxLength = Math.max(maxLength, length);
            }
        });
        column.width = maxLength + 2;
    });

    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `${timestamp}-${originalFilename}.xlsx`;
    const outputPath = path.join(publicDir, filename);

    await workbook.xlsx.writeFile(outputPath);
    return { outputPath, filename };
}

async function createPdfFile(data, originalFilename, title) {
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `${timestamp}-${originalFilename}.pdf`;
    const outputPath = path.join(publicDir, filename);

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc.y = 50;

    if (title) {
        doc.font('Helvetica-Bold').fontSize(16).text(title, { align: 'center' });
        doc.y = 30;
        doc.moveDown(3);
    }

    const headers = Object.keys(data[0]).map((header) => header.toUpperCase());
    const rows = data.map((row) =>
        Object.values(row).map((value) => (value !== null && value !== undefined ? value : ''))
    );

    await doc.table(
        {
            headers: headers,
            rows: rows,
        },
        {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(12),
            prepareRow: () => doc.font('Helvetica').fontSize(10),
        }
    );

    doc.end();

    await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });

    return { outputPath, filename };
}

app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ message: 'No file uploaded.' });

    const title = req.body.title || '';

    try {
        const filePath = req.file.path;
        const originalFilename = path.parse(req.file.originalname).name;

        const mimeType = getMimeType(filePath);

        const uploadedFile = await fileManager.uploadFile(filePath, {
            mimeType,
            displayName: req.file.originalname,
        });

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `Extract and display what is written in this document(Only the written part in the form of rows and columns and not printed text/watermarks) as JSON with rows and columns with no backticks. Do not wrap the json codes in JSON markers such as backticks. If there is a date, follow the separation of month, year, day with "/" or "-" as written in the document. Generate only rows and columns and no page numbers i.e., the whole json should be one single array of objects. The numbers should return as numbers, not as text i.e., numbers should not be enclosed in double quotes. Display quantities as quantities for example, 10mL.`;

        const result = await model.generateContent([{
            fileData: { mimeType: uploadedFile.file.mimeType, fileUri: uploadedFile.file.uri }
        }, '\n\n', prompt]);

        const jsonResponse = JSON.parse(result.response.text().trim());

        const { outputPath: excelPath, filename: excelFilename } = await createExcelFile(jsonResponse, originalFilename, title);
        const { outputPath: pdfPath, filename: pdfFilename } = await createPdfFile(jsonResponse, originalFilename, title);

        res.json({
            excelFileUrl: `/public/${excelFilename}`,
            pdfFileUrl: `/public/${pdfFilename}`,
        });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ message: 'Error processing file.' });
    }
});


// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
