import { texToMathML, texToOMML } from './parser.js';

let currentOMML = "";

function handleConvert() {
    const tex = document.getElementById('texInput').value;
    
    const mathML = texToMathML(tex);
    currentOMML = texToOMML(tex);
    
    document.getElementById('mathMLPreview').innerHTML = mathML;
    document.getElementById('mathMLCode').textContent = mathML;
    document.getElementById('ommlCode').textContent = currentOMML;
}

function handleDownload() {
    if (!currentOMML) {
        alert("Сначала сгенерируйте формулу!");
        return;
    }

    const wordXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://microsoft.com" xmlns:m="http://openxmlformats.org" xml:space="preserve">
    <w:body>
        <w:p><w:r><w:t>Формула, созданная на GitHub Pages:</w:t></w:r></w:p>
        <w:p>${currentOMML}</w:p>
    </w:body>
</w:wordDocument>`;

    const blob = new Blob([wordXml], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "github_formula.xml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Привязываем события к кнопкам после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnConvert').addEventListener('click', handleConvert);
    document.getElementById('btnDownload').addEventListener('click', handleDownload);
    handleConvert(); // Первичный запуск
});
