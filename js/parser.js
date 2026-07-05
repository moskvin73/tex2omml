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

function preprocessTeX(tex, format) {
    let res = tex.trim();
    if (format === 'mathml') {
        res = res.replace(/\\cdot/g, '<mo>&#x22C5;</mo>');
    } else {
        res = res.replace(/\\cdot/g, '<m:r>·</m:r>');
    }
    Object.keys(greekLetters).forEach(key => {
        const regex = new RegExp(key.replace(/\\/g, '\\\\'), 'g');
        if (format === 'mathml') {
            res = res.replace(regex, `<mi>${greekLetters[key].mathml}</mi>`);
        } else {
            res = res.replace(regex, `<m:r>${greekLetters[key].omml}</m:r>`);
        }
    });
    return res;
}

function parseMatrixContent(content, format) {
    const rows = content.split(/\\\\/);
    let xmlResult = '';

    rows.forEach(row => {
        if (!row.trim()) return;
        const columns = row.split('&');
        
        if (format === 'mathml') {
            xmlResult += '<mtr>';
            columns.forEach(col => {
                xmlResult += `<mtd><mrow>${texToMathML(col.trim(), true)}</mrow></mtd>`;
            });
            xmlResult += '</mtr>';
        } else {
            xmlResult += '<m:mr>';
            columns.forEach(col => {
                xmlResult += `<m:e>${texToOMML(col.trim(), true)}</m:e>`;
            });
            xmlResult += '</m:mr>';
        }
    });
    return xmlResult;
}

export function texToMathML(tex, isSubCall = false) {
    let str = preprocessTeX(tex, 'mathml');

    str = str.replace(/\\begin\{(matrix|pmatrix|bmatrix)\}([\s\S]*?)\\end\{\1\}/g, (match, type, content) => {
        let mat = `<mtable>${parseMatrixContent(content, 'mathml')}</mtable>`;
        if (type === 'pmatrix') return `<mo>&#x0028;</mo>${mat}<mo>&#x0029;</mo>`;
        if (type === 'bmatrix') return `<mo>&#x005B;</mo>${mat}<mo>&#x005D;</mo>`;
        return mat;
    });

    str = str.replace(/\\left\(/g, '<mo maxsize="100%">&#x0028;</mo>');
    str = str.replace(/\\right\)/g, '<mo maxsize="100%">&#x0029;</mo>');

    str = str.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '<mfrac><mrow>$1</mrow><mrow>$2</mrow></mfrac>');
    
    // ИСПРАВЛЕНО: Сначала извлекаем корень n-ой степени, а затем обычный квадратный корень
    str = str.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^}]*)\}/g, '<mroot><mrow>$2</mrow><mrow>$1</mrow></mroot>');
    str = str.replace(/\\sqrt\s*\{([^}]*)\}/g, '<msqrt><mrow>$1</mrow></msqrt>');
    
    str = str.replace(/([A-Za-z0-9]+)\^\{([^}]*)\}/g, '<msup><mi>$1</mi><mrow>$2</mrow></msup>');
    str = str.replace(/([A-Za-z0-9]+)\^([A-Za-z0-9]+)/g, '<msup><mi>$1</mi><mi>$2</mi></msup>');
    str = str.replace(/([A-Za-z0-9]+)_\{([^}]*)\}/g, '<msub><mi>$1</mi><mrow>$2</mrow></msub>');
    str = str.replace(/([A-Za-z0-9]+)_([A-Za-z0-9]+)/g, '<msub><mi>$1</mi><mi>$2</mi></msub>');

    let tokens = str.split(/(<\/?[a-zA-Z1-9:]+[^>]*>|&#?[a-zA-Z0-9]+;)/g);
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (!t || t.startsWith('<') || t.startsWith('&')) continue; 
        
        let subTokens = t.split(/([\s\+\-\=\/\*\(\)[A-Za-z0-9]])/g);
        for (let j = 0; j < subTokens.length; j++) {
            let st = subTokens[j].trim();
            if (!st) continue;
            if (['+', '-', '=', '*', '/', '(', ')'].includes(st)) subTokens[j] = `<mo>${st}</mo>`;
            else if (/^[0-9]+$/.test(st)) subTokens[j] = `<mn>${st}</mn>`;
            else if (/^[A-Za-z]+$/.test(st)) subTokens[j] = `<mi>${st}</mi>`;
        }
        tokens[i] = subTokens.join('');
    }
    
    if (isSubCall) return tokens.join('');
    return `<math xmlns="http://w3.org" display="block">${tokens.join('')}</math>`;
}

export function texToOMML(tex, isSubCall = false) {
    let str = preprocessTeX(tex, 'omml');

    str = str.replace(/\\begin\{(matrix|pmatrix|bmatrix)\}([\s\S]*?)\\end\{\1\}/g, (match, type, content) => {
        let mat = `<m:m><m:mPr><m:baseJc m:val="center"/></m:mPr>${parseMatrixContent(content, 'omml')}</m:m><m:ctrlPr/>`;
        if (type === 'pmatrix') return `<m:d><m:dPr><m:begChr w:val="("/><m:endChr w:val=")"/></m:dPr><m:e>${mat}</m:e></m:d>`;
        if (type === 'bmatrix') return `<m:d><m:dPr><m:begChr w:val="["/><m:endChr w:val="]"/></m:dPr><m:e>${mat}</m:e></m:d>`;
        return mat;
    });

    str = str.replace(/\\left\((.*?)\\right\)/g, '<m:d><m:dPr><m:begChr w:val="("/><m:endChr w:val=")"/></m:dPr><m:e>$1</m:e></m:d>');
    str = str.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '<m:f><m:num>$1</m:num><m:den>$2</m:den></m:f>');
    
    // ИСПРАВЛЕНО: Четкий последовательный разбор корней для Word 2010
    str = str.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^}]*)\}/g, '<m:rad><m:radPr></m:radPr><m:deg><m:r>$1</m:r></m:deg><m:e>$2</m:e></m:rad>');
    str = str.replace(/\\sqrt\s*\{([^}]*)\}/g, '<m:sRad><m:sRadPr></m:sRadPr><m:e>$1</m:e></m:sRad>');
    
    str = str.replace(/([A-Za-z0-9]+)\^\{([^}]*)\}/g, '<m:sSup><m:e><m:r>$1</m:r></m:e><m:sup>$2</m:sup></m:sSup>');
    str = str.replace(/([A-Za-z0-9]+)\^([A-Za-z0-9]+)/g, '<m:sSup><m:e><m:r>$1</m:r></m:e><m:sup>$2</m:sup></m:sSup>');
    str = str.replace(/([A-Za-z0-9]+)_\{([^}]*)\}/g, '<m:sSub><m:e><m:r>$1</m:r></m:e><m:sub>$2</m:sub></m:sSub>');
    str = str.replace(/([A-Za-z0-9]+)_([A-Za-z0-9]+)/g, '<m:sSub><m:e><m:r>$1</m:r></m:e><m:sub>$2</m:sub></m:sSub>');

    let tokens = str.split(/(<\/?[m]:[a-zA-Z1-9]+[^>]*>)/g);
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (!t || t.startsWith('<')) continue;
        
        let subTokens = t.split(/([\s\+\-\=\/\*\(\)[A-Za-z0-9]])/g);
        for (let j = 0; j < subTokens.length; j++) {
            let st = subTokens[j].trim();
            if (st) subTokens[j] = `<m:r>${st}</m:r>`;
        }
        tokens[i] = subTokens.join('');
    }
    
    if (isSubCall) return tokens.join('');
    return `<m:oMath>${tokens.join('')}</m:oMath>`;
}
