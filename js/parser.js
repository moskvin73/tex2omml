// Модуль для трансляции TeX синтаксиса

export function texToMathML(tex) {
    let str = tex.trim();
    while (str.includes('\\frac')) {
        str = str.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '<mfrac><mrow>$1</mrow><mrow>$2</mrow></mfrac>');
    }
    while (str.includes('\\sqrt')) {
        str = str.replace(/\\sqrt\s*\{([^}]*)\}/g, '<msqrt><mrow>$1</mrow></msqrt>');
    }
    str = str.replace(/([A-Za-z0-9]+)\^\{([^}]*)\}/g, '<msup><mi>$1</mi><mrow>$2</mrow></msup>');
    str = str.replace(/([A-Za-z0-9]+)\^([A-Za-z0-9]+)/g, '<msup><mi>$1</mi><mi>$2</mi></msup>');
    str = str.replace(/([A-Za-z0-9]+)_\{([^}]*)\}/g, '<msub><mi>$1</mi><mrow>$2</mrow></msub>');
    str = str.replace(/([A-Za-z0-9]+)_([A-Za-z0-9]+)/g, '<msub><mi>$1</mi><mi>$2</mi></msup>');

    let tokens = str.split(/(<\/?[a-z1-9]+>|[\s\+\-\=\/\*])/g);
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (!t || t.startsWith('<')) continue; 
        if (['+', '-', '=', '*', '/'].includes(t.trim())) tokens[i] = `<mo>${t.trim()}</mo>`;
        else if (/^[0-9]+$/.test(t.trim())) tokens[i] = `<mn>${t.trim()}</mn>`;
        else if (/^[A-Za-z]+$/.test(t.trim())) tokens[i] = `<mi>${t.trim()}</mi>`;
    }
    return `<math xmlns="http://w3.org" display="block">${tokens.join('')}</math>`;
}

export function texToOMML(tex) {
    let str = tex.trim();
    while (str.includes('\\frac')) {
        str = str.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '<m:f><m:num>$1</m:num><m:den>$2</m:den></m:f>');
    }
    while (str.includes('\\sqrt')) {
        str = str.replace(/\\sqrt\s*\{([^}]*)\}/g, '<m:rad><m:radPr></m:radPr><m:deg/><m:e>$1</m:e></m:rad>');
    }
    str = str.replace(/([A-Za-z0-9]+)\^\{([^}]*)\}/g, '<m:sSup><m:e>$1</m:e><m:sup>$2</m:sup></m:sSup>');
    str = str.replace(/([A-Za-z0-9]+)\^([A-Za-z0-9]+)/g, '<m:sSup><m:e>$1</m:e><m:sup>$2</m:sup></m:sSup>');
    str = str.replace(/([A-Za-z0-9]+)_\{([^}]*)\}/g, '<m:sSub><m:e>$1</m:e><m:sub>$2</m:sub></m:sSub>');
    str = str.replace(/([A-Za-z0-9]+)_([A-Za-z0-9]+)/g, '<m:sSub><m:e>$1</m:e><m:sub>$2</m:sub></m:sSub>');

    let tokens = str.split(/(<\/?[m]:[a-zA-Z]+>)/g);
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (!t || t.startsWith('<')) continue;
        
        let subTokens = t.trim().split(/([\s\+\-\=\/\*A-Za-z0-9])/g);
        for (let j = 0; j < subTokens.length; j++) {
            let st = subTokens[j].trim();
            if (st) {
                subTokens[j] = `<m:r><m:t>${st}</m:t></m:r>`;
            }
        }
        tokens[i] = subTokens.join('');
    }
    return `<m:oMath>${tokens.join('')}</m:oMath>`;
}
