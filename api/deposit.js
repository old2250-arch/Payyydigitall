import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const config = {
    api: {
        bodyParser: false, // nonaktifkan bodyParser default untuk menangani file
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Ambil environment variables
    const botToken = process.env.BOT_TOKEN;
    const adminChatId = process.env.ADMIN_CHAT_ID;

    if (!botToken || !adminChatId) {
        console.error('Missing Telegram credentials');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Parse form data
    const form = formidable({
        multiples: false,
        maxFileSize: 5 * 1024 * 1024, // 5MB
        keepExtensions: true,
    });

    try {
        const { fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                else resolve({ fields, files });
            });
        });

        const username = fields.username?.[0]?.trim();
        const amount = parseInt(fields.amount?.[0]);
        const file = files.file?.[0];

        // Validasi
        if (!username || !amount || !file) {
            return res.status(400).json({ error: 'Username, nominal, dan bukti transfer harus diisi' });
        }
        if (isNaN(amount) || amount < 10000) {
            return res.status(400).json({ error: 'Nominal minimal Rp 10.000' });
        }

        // Baca file menjadi buffer
        const fileBuffer = fs.readFileSync(file.filepath);

        // === OPSIONAL: Auto-check transaksi ===
        // Di sini Anda bisa menambahkan logika untuk mengecek apakah transfer benar-benar masuk.
        // Misalnya, panggil API payment gateway menggunakan nominal dan username.
        // Jika auto-check sukses, bisa langsung proses deposit (tambah saldo).
        // Namun karena tidak ada API payment yang disediakan, kita lewati dulu.

        // Kirim notifikasi ke admin via Telegram
        const caption = `
💰 *DEPOSIT BARU* 💰

👤 *Username Two Pay:* ${username}
💵 *Nominal:* Rp ${amount.toLocaleString('id-ID')}
🕒 *Waktu:* ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}

📸 *Bukti Transfer:* (terlampir)
        `;

        // Gunakan FormData untuk mengirim file ke Telegram
        const FormData = (await import('form-data')).default;
        const tgForm = new FormData();
        tgForm.append('chat_id', adminChatId);
        tgForm.append('caption', caption);
        tgForm.append('parse_mode', 'Markdown');
        tgForm.append('photo', fileBuffer, {
            filename: file.originalFilename,
            contentType: file.mimetype,
        });

        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
        const response = await axios.post(telegramUrl, tgForm, {
            headers: tgForm.getHeaders(),
        });

        if (response.data.ok) {
            // Hapus file temporary
            fs.unlinkSync(file.filepath);
            return res.status(200).json({ success: true, message: 'Deposit berhasil dikirim' });
        } else {
            throw new Error('Gagal mengirim notifikasi ke admin');
        }
    } catch (error) {
        console.error('Error processing deposit:', error);
        return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
    }
}