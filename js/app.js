//import { texToMathML, texToOMML } from './parser.js?v=18';
import { texToMathML, texToOMML } from './parser2.js?v=26';

let currentOMML = "";

function formatXML(xml) {
    // 1. Убираем уже существующие случайные переносы и лишние пробелы между тегами
    let reg = /(>)\s*(<)(\/*)/g;
    let cleanXml = xml.replace(reg, '$1\r\n$2$3');
    
    let pad = 0;
    let formatted = '';
    let lines = cleanXml.split('\r\n');
    
    // Теги, содержимое которых нельзя форматировать переносами строк (сохраняем текст внутри)
    const preserveTextTags = /<m:t|<mtext|<mi|<mn|<mo/i;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        let indent = 0;
        
        if (line.match(/.+<\/\w[^>]*>$/)) {
            // Тег открывается и закрывается на одной строке (например: <m:chr m:val="∑"/>)
            indent = 0;
        } else if (line.match(/^<\/\w/)) {
            // Закрывающий тег (например: </m:e>) -> уменьшаем отступ
            if (pad !== 0) pad -= 1;
        } else if (line.match(/^<\w([^>]*[^\/])?>$/) && !preserveTextTags.test(line)) {
            // Открывающий структурный тег -> увеличиваем отступ для следующей строки
            indent = 1;
        } else {
            indent = 0;
        }

        // Добавляем текущую строку с нужным количеством отступов (используем 2 пробела или '\t')
        formatted += '  '.repeat(pad) + line + '\r\n';
        pad += indent;
    }

    return formatted.trim();
}

function handleConvert() {
    const tex = document.getElementById('texInput').value;
    
    const mathML = texToMathML(tex);
    currentOMML = texToOMML(tex); 
    
    document.getElementById('mathMLPreview').innerHTML = mathML;
    document.getElementById('mathMLCode').textContent = formatXML(mathML);
    document.getElementById('ommlCode').textContent = formatXML(currentOMML);
}

async function handleCopyWord() {
    if (!currentOMML) {
        alert("Сначала сгенерируйте формулу!");
        return;
    }

        // Получаем выбранный пользователем режим (block или inline)
    const selectedMode = document.querySelector('input[name="mathMode"]:checked').value;

    // Формируем тело документа в зависимости от режима
    let formulaPayload = "";
    if (selectedMode === "block") {
        // Блочный режим: используем m:oMathPara с выравниванием по центру
        formulaPayload = `
        <p class="MsoEquation" style="text-align:center;">
        <m:oMathPara>
            <m:oMathParaPr><m:jc m:val="centerGroup"/></m:oMathParaPr>
            ${currentOMML}
        </m:oMathPara>
        </p>`;
    } else {
        // Встроенный режим (Inline): m:oMathPara ЗАПРЕЩЕН, пишем прямо в текстовый абзац MsoNormal
        formulaPayload = `
        <p class="MsoNormal">
            ${currentOMML}
        </p>`;
    }     

    // Добавляем глобальные стили для Word: Cambria Math, курсив, размер 12pt
    /*const htmlPayload = `
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
    ${formulaPayload}
    <![endif]-->
    <!--EndFragment-->
</body>
</html>`.trim();*/

    const htmlPayload = `
    <!--[if gte msEquation 12]>
    ${formulaPayload}
    <![endif]-->
</html>`.trim();
    
    

    try {
        const htmlBlob = new Blob([htmlPayload], { type: "text/html" });
        const textBlob = new Blob([currentOMML], { type: "text/plain" });

        const data = [new ClipboardItem({ 
            "text/html": htmlBlob,
            "text/plain": textBlob
        })];
        
        await navigator.clipboard.write(data);
        
        const btn = document.getElementById('btnCopyWord');
        const oldText = btn.textContent;
        btn.textContent = "✓ Успешно скопировано!";
        btn.style.backgroundColor = "#107c41";
        
        setTimeout(() => {
            btn.textContent = "Скопировано для Word (Ctrl+V)";
            btn.style.backgroundColor = "#217346";
        }, 2000);

    } catch (err) {
        console.error("Ошибка буфера: ", err);
        alert("Кликните по странице и попробуйте еще раз.");
    }
}

function handleDownload() {
    if (!currentOMML) {
        alert("Сначала сгенерируйте формулу!");
        return;
    }

    const wordXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/2004/12/omml" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml" xml:space="preserve">
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
    // ИСПРАВЛЕНО: Теперь событие клика привязано к кнопке копирования
    document.getElementById('btnCopyWord').addEventListener('click', handleCopyWord);
    document.getElementById('btnDownload').addEventListener('click', handleDownload);
    handleConvert(); // Первичный запуск
});
