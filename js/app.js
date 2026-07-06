import { texToMathML, texToOMML } from './parser.js?v=10';

let currentOMML = "";

function handleConvert() {
    const tex = document.getElementById('texInput').value;
    
    const mathML = texToMathML(tex);
    currentOMML = texToOMML(tex); 
    
    document.getElementById('mathMLPreview').innerHTML = mathML;
    document.getElementById('mathMLCode').textContent = mathML;
    document.getElementById('ommlCode').textContent = currentOMML;
}

async function handleCopyWord() {
    if (!currentOMML) {
        alert("Сначала сгенерируйте формулу!");
        return;
    }

        // Получаем выбранный пользователем режим (block или inline)
    const selectedMode = document.querySelector('input[name="mathMode"]:checked').value;

    // Модифицируем OMML код строго под требования буфера обмена Word 2010.
    // Находим все теги <m:t>Текст</m:t> и внедряем в них инлайн-курсив и шрифт Cambria Math.
    // Исключаем из курсива знаки плюс, минус, равно и цифры, чтобы они оставались прямыми!
    const richOMML = currentOMML.replace(/<m:t>([\s\S]*?)<\/m:t>/g, (match, text) => {
        const trimmed = text.trim();
        
        // ИСПРАВЛЕНО: Делаем курсивом СТРОГО одиночные латинские буквы (переменные)
        if (/^[A-Za-z]$/.test(trimmed)) {
            return `<m:t><i><span style='font-size:12.0pt;font-family:"Cambria Math","serif";mso-fareast-font-family:"Times New Roman";mso-bidi-font-family:"Times New Roman";'>${text}</span></i></m:t>`;
        }
        
        // Все остальное (цифры, операторы, кириллица, целые слова из \text) остается ПРЯМЫМ шрифтом
        return `<m:t><span style='font-size:12.0pt;font-family:"Cambria Math","serif";'>${text}</span></m:t>`;
    });

    // Формируем тело документа в зависимости от режима
    let formulaPayload = "";
    if (selectedMode === "block") {
        // Блочный режим: используем m:oMathPara с выравниванием по центру
        formulaPayload = `
        <m:oMathPara>
            <m:oMathParaPr><m:jc m:val="centerGroup"/></m:oMathParaPr>
            ${richOMML}
        </m:oMathPara>`;
    } else {
        // Встроенный режим (Inline): m:oMathPara ЗАПРЕЩЕН, пишем прямо в текстовый абзац MsoNormal
        formulaPayload = `
        <p class="MsoNormal">
            <span style='font-size:11.0pt;font-family:"Calibri","sans-serif";'>Текст перед формулой </span>
            ${richOMML}
            <span style='font-size:11.0pt;font-family:"Calibri","sans-serif";'> текст после формулы.</span>
        </p>`;
    }    

    // Добавляем глобальные стили для Word: Cambria Math, курсив, размер 12pt
    const htmlPayload = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 14">
<style>
  /* Принудительно задаем для всех элементов формулы Word родной курсив и шрифт */
  m\\:r {
    font-family: "Cambria Math", "serif";
    font-size: 12.0pt;
    font-style: italic;
  }
</style>
</head>
<body>
    <!--StartFragment-->
    <!--[if gte msEquation 12]>
    <m:oMathPara>
        ${richOMML}
    </m:oMathPara>
    <![endif]-->
    <!--EndFragment-->
</body>
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
