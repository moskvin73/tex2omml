// Модуль для трансляции TeX синтаксиса в MathML и OMML (Word 2010)

const greekLetters = {
    '\\alpha': { mathml: '&#x03B1;', omml: 'α' },
    '\\beta': { mathml: '&#x03B2;', omml: 'β' },
    '\\gamma': { mathml: '&#x03B3;', omml: 'γ' },
    '\\delta': { mathml: '&#x03B4;', omml: 'δ' },
    '\\lambda': { mathml: '&#x03BB;', omml: 'λ' },
    '\\pi': { mathml: '&#x03C0;', omml: 'π' },
    '\\sigma': { mathml: '&#x03C3;', omml: 'σ' },
    '\\omega': { mathml: '&#x03C9;', omml: 'ω' },
    '\\Delta': { mathml: '&#x0394;', omml: 'Δ' }
};

// Функция для красивого форматирования XML кода (добавляет переносы строк и табы)
function formatXML(xml) {
    let formatted = '';
    let reg = /(>)(<)(\/*)/g;
    xml = xml.replace(reg, '$1\r\n$2$3');
    let pad = 0;
    xml.split('\r\n').forEach(function(node) {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
            indent = 0;
        } else if (node.match(/^<\/\w/)) {
            if (pad !== 0) pad -= 1;
        } else if (node.match(/^<\w[^>]*[^\/]>$/)) {
            indent = 1;
        } else {
            indent = 0;
        }

        let padding = '';
        for (let i = 0; i < pad; i++) {
            padding += '    ';
        }

        formatted += padding + node + '\r\n';
        pad += indent;
    });

    return formatted.trim();
}

function preprocessTeX(tex, format) {
    let res = tex.trim();

    // Замена знака умножения \cdot на точку
    if (format === 'mathml') {
        res = res.replace(/\\cdot/g, '<mo>&#x22C5;</mo>');
    } else {
        res = res.replace(/\\cdot/g, '<m:r><m:t>·</m:t></m:r>');
    }

    // Замена греческих букв из словаря
    Object.keys(greekLetters).forEach(key => {
        const regex = new RegExp(key.replace(/\\/g, '\\\\'), 'g');
        if (format === 'mathml') {
            res = res.replace(regex, `<mi>${greekLetters[key].mathml}</mi>`);
        } else {
            res = res.replace(regex, `<m:r><m:t>${greekLetters[key].omml}</m:t></m:r>`);
        }
    });

    return res;
}

export function texToMathML(tex) {
    let str = preprocessTeX(tex, 'mathml');

    // Обработка круглых скобок \left( \right)
    str = str.replace(/\\left\(/g, '<mo maxsize="100%">&#x0028;</mo>');
    str = str.replace(/\\right\)/g, '<mo maxsize="100%">&#x0029;</mo>');

    // Структурные элементы
    while (str.includes('\\frac')) {
        str = str.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '<mfrac><mrow>$1</mrow><mrow>$2</mrow></mfrac>');
    }
    while (str.includes('\\sqrt')) {
        str = str.replace(/\\sqrt\s*\{([^}]*)\}/g, '<msqrt><mrow>$1</mrow></msqrt>');
    }
    
    // Обработка индексов и степеней (исправлено: исключаем повторную обертку уже готовых тегов)
    str = str.replace(/([A-Za-z0-9]+)\^\{([^}]*)\}/g, '<msup><mi>$1</mi><mrow>$2</mrow></msup>');
    str = str.replace(/([A-Za-z0-9]+)\^([A-Za-z0-9]+)/g, '<msup><mi>$1</mi><mi>$2</mi></msup>');
    str = str.replace(/([A-Za-z0-9]+)_\{([^}]*)\}/g, '<msub><mi>$1</mi><mrow>$2</mrow></msub>');
    str = str.replace(/([A-Za-z0-9]+)_([A-Za-z0-9]+)/g, '<msub><mi>$1</mi><mi>$2</mi></msub>');

    // Токенизация: разбиваем по тегам и сущностям, чтобы обрабатывать только чистый текст
    let tokens = str.split(/(<\/?[a-zA-Z1-9:]+[^>]*>|&#?[a-zA-Z0-9]+;)/g);
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (!t || t.startsWith('<') || t.startsWith('&')) continue; 
        
        let subTokens = t.split(/([\s\+\-\=\/\*\( \)])/g);
        for (let j = 0; j < subTokens.length; j++) {
            let st = subTokens[j].trim();
            if (!st) continue;
            if (['+', '-', '=', '*', '/', '(', ')'].includes(st)) {
                subTokens[j] = `<mo>${st}</mo>`;
            } else if (/^[0-9]+$/.test(st)) {
                subTokens[j] = `<mn>${st}</mn>`;
            } else if (/^[A-Za-z]+$/.test(st)) {
                subTokens[j] = `<mi>${st}</mi>`;
            }
        }
        tokens[i] = subTokens.join('');
    }
    
    const finalRawXML = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${tokens.join('')}</math>`;
    return formatXML(finalRawXML);
}

export function texToOMML(tex) {
    let str = preprocessTeX(tex, 'omml');

    // Обработка скобок для Word \left( \right) -> контейнер m:d (delimiter)
    while (str.includes('\\left(')) {
        str = str.replace(/\\left\((.*?)\\right\)/g, '<m:d><m:dPr><m:begChr w:val="("/><m:endChr w:val=")"/></m:dPr><m:e>$1</m:e></m:d>');
    }

    // Структурные элементы Word
    while (str.includes('\\frac')) {
        str = str.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '<m:f><m:num>$1</m:num><m:den>$2</m:den></m:f>');
    }
    while (str.includes('\\sqrt')) {
        str = str.replace(/\\sqrt\s*\{([^}]*)\}/g, '<m:rad><m:radPr></m:radPr><m:deg/><m:e>$1</m:e></m:rad>');
    }
    
    // Индексы и степени в OMML
    str = str.replace(/([A-Za-z0-9]+)\^\{([^}]*)\}/g, '<m:sSup><m:e><m:r><m:t>$1</m:t></m:r></m:e><m:sup>$2</m:sup></m:sSup>');
    str = str.replace(/([A-Za-z0-9]+)\^([A-Za-z0-9]+)/g, '<m:sSup><m:e><m:r><m:t>$1</m:t></m:r></m:e><m:sup>$2</m:sup></m:sSup>');
    str = str.replace(/([A-Za-z0-9]+)_\{([^}]*)\}/g, '<m:sSub><m:e><m:r><m:t>$1</m:t></m:r></m:e><m:sub>$2</m:sub></m:sSub>');
    str = str.replace(/([A-Za-z0-9]+)_([A-Za-z0-9]+)/g, '<m:sSub><m:e><m:r><m:t>$1</m:t></m:r></m:e><m:sub>$2</m:sub></m:sSub>');

    // Токенизация для OMML
    let tokens = str.split(/(<\/?[m]:[a-zA-Z]+>)/g);
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (!t || t.startsWith('<')) continue;
        
        let subTokens = t.split(/([\s\+\-\=\/\*\( \)[A-Za-z0-9]])/g);
        for (let j = 0; j < subTokens.length; j++) {
            let st = subTokens[j].trim();
            if (st) {
                // Оборачиваем строго в m:r, как в вашем родном дампе Word
                subTokens[j] = `<m:r>${st}</m:r>`;
            }
        }
        tokens[i] = subTokens.join('');
    }
    
    const finalRawXML = `<m:oMath>${tokens.join('')}</m:oMath>`;
    return formatXML(finalRawXML);
}
