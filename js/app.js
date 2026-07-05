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

async function handleCopyWord() {
    if (!currentOMML) {
        alert("Сначала сгенерируйте формулу!");
        return;
    }

    // Собираем минимальный работающий шаблон на основе вашего дампа Word 14
    const htmlPayload = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 14">
</head>
<body>
    <!--StartFragment-->
    <!--[if gte msEquation 12]>
    <m:oMathPara>
        ${currentOMML}
    </m:oMathPara>
    <![endif]-->
    <!--EndFragment-->
</body>
</html>`.trim();

    try {
        const blob = new Blob([htmlPayload], { type: "text/html" });
        const data = [new ClipboardItem({ "text/html": blob })];
        
        await navigator.clipboard.write(data);
        
        const btn = document.getElementById('btnCopyWord');
        const oldText = btn.textContent;
        btn.textContent = "✓ Успешно скопировано!";
        btn.style.backgroundColor = "#107c41";
        
        setTimeout(() => {
            btn.textContent = oldText;
            btn.style.backgroundColor = "#217346";
        }, 2000);

    } catch (err) {
        console.error("Ошибка буфера: ", err);
        alert("Кликните по странице и попробуйте еще раз (требуется фокус пользователя).");
    }
}
