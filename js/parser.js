// КОМПИЛЯТОР: СКАНЕР + РЕКУРСИВНЫЙ СПУСК (AST)
const GREEK_MAP = {
    'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ',
    'lambda': 'λ', 'pi': 'π', 'sigma': 'σ', 'omega': 'ω', 'Delta': 'Δ'
};

function tokenize(tex) {
    const tokens = []; let i = 0;
    while (i < tex.length) {
        const char = tex[i];
        if (/\s/.test(char)) { i++; continue; }
        if (char === '{') { tokens.push({ type: 'LBRACE' }); i++; continue; }
        if (char === '}') { tokens.push({ type: 'RBRACE' }); i++; continue; }
        if (char === '[') { tokens.push({ type: 'LBRACKET' }); i++; continue; }
        if (char === ']') { tokens.push({ type: 'RBRACKET' }); i++; continue; }
        if (char === '&') { tokens.push({ type: 'ALIGN' }); i++; continue; }
        if (char === '\\' && tex[i + 1] === '\\') { tokens.push({ type: 'NEWLINE' }); i += 2; continue; }
        if (char === '\\') {
            let match = tex.slice(i + 1).match(/^[a-zA-Z]+/);
            if (match) { tokens.push({ type: 'COMMAND', value: match[0] }); i += 1 + match[0].length; continue; }
        }
        if (['+', '-', '=', '*', '/', '(', ')'].includes(char)) { tokens.push({ type: 'OPERATOR', value: char }); i++; continue; }
        tokens.push({ type: 'CHAR', value: char }); i++;
    }
    tokens.push({ type: 'EOF' }); return tokens;
}

class TeXParser {
    constructor(tokens) { this.tokens = tokens; this.pos = 0; }
    peek() { return this.tokens[this.pos]; }
    consume(type) { const tok = this.peek(); if (type && tok.type !== type) throw new Error(`Error: ${type}`); this.pos++; return tok; }
    parse() {
        const nodes = [];
        while (this.pos < this.tokens.length) {
            const t = this.peek().type;
            if (t === 'EOF' || t === 'RBRACE' || t === 'RBRACKET' || t === 'ALIGN' || t === 'NEWLINE') break;
            nodes.push(this.parseExpression());
        }
        return nodes;
    }
    parseExpression() {
        let node = this.parsePrimary();
        while (this.peek().type === 'CHAR' && (this.peek().value === '^' || this.peek().value === '_')) {
            const op = this.consume('CHAR').value; let scriptNode = null;
            if (this.peek().type === 'LBRACE') { this.consume('LBRACE'); scriptNode = this.parse(); this.consume('RBRACE'); }
            else { scriptNode = [this.parsePrimary()]; }
            node = { type: op === '^' ? 'SupNode' : 'SubNode', base: node, script: scriptNode };
        }
        return node;
    }
    parsePrimary() {
        const tok = this.peek();
        if (tok.type === 'CHAR' || tok.type === 'OPERATOR') { this.consume(); return { type: 'TextNode', value: tok.value }; }
        if (tok.type === 'COMMAND') {
            this.consume();
            if (tok.value === 'frac') {
                this.consume('LBRACE'); const num = this.parse(); this.consume('RBRACE');
                this.consume('LBRACE'); const den = this.parse(); this.consume('RBRACE');
                return { type: 'FractionNode', num, den };
            }
            if (tok.value === 'sqrt') {
                let deg = null;
                if (this.peek().type === 'LBRACKET') { this.consume('LBRACKET'); deg = [this.parseExpression()]; this.consume('RBRACKET'); }
                this.consume('LBRACE'); const body = this.parse(); this.consume('RBRACE');
                return { type: 'RadicalNode', deg, body };
            }
            if (tok.value === 'begin') {
                this.consume('LBRACE'); const envName = this.consume('CHAR').value;
                while(this.peek().type === 'CHAR') this.consume(); this.consume('RBRACE');
                const rows = []; let currentRow = [];
                while (true) {
                    const nextTok = this.peek();
                    if (nextTok.type === 'COMMAND' && nextTok.value === 'end') break;
                    if (nextTok.type === 'ALIGN' || nextTok.type === 'NEWLINE') { this.consume(); rows.push(currentRow); currentRow = []; }
                    else { currentRow.push(this.parseExpression()); }
                }
                if (currentRow.length > 0) rows.push(currentRow);
                this.consume('COMMAND'); this.consume('LBRACE'); while(this.peek().type === 'CHAR') this.consume(); this.consume('RBRACE');
                return { type: 'MatrixNode', env: envName, rows };
            }
            if (tok.value === 'cdot') return { type: 'TextNode', value: '·' };
            if (GREEK_MAP[tok.value]) return { type: 'GreekNode', value: GREEK_MAP[tok.value] };
            return { type: 'TextNode', value: '\\' + tok.value };
        }
        if (tok.type === 'LBRACE') { this.consume('LBRACE'); const body = this.parse(); this.consume('RBRACE'); return { type: 'GroupNode', body }; }
        this.consume(); return { type: 'TextNode', value: tok.value || '' };
    }
}

function renderMathML(nodes) {
    if (!nodes) return '';
    return nodes.map(node => {
        if (node.type === 'TextNode' || node.type === 'GreekNode') {
            if (['+', '-', '=', '*', '/'].includes(node.value)) return `<mo>${node.value}</mo>`;
            if (/^[0-9]+$/.test(node.value)) return `<mn>${node.value}</mn>`;
            return `<mi>${node.value}</mi>`;
        }
        if (node.type === 'GroupNode') return `<mrow>${renderMathML(node.body)}</mrow>`;
        if (node.type === 'FractionNode') return `<mfrac><mrow>${renderMathML(node.num)}</mrow><mrow>${renderMathML(node.den)}</mrow></mfrac>`;
        if (node.type === 'RadicalNode') {
            if (node.deg) return `<mroot><mrow>${renderMathML(node.body)}</mrow><mrow>${renderMathML(node.deg)}</mrow></mroot>`;
            return `<msqrt><mrow>${renderMathML(node.body)}</mrow></msqrt>`;
        }
        if (node.type === 'SupNode') return `<msup><mrow>${renderMathML([node.base])}</mrow><mrow>${renderMathML(node.script)}</mrow></msup>`;
        if (node.type === 'SubNode') return `<msub><mrow>${renderMathML([node.base])}</mrow><mrow>${renderMathML(node.script)}</mrow></msub>`;
        if (node.type === 'MatrixNode') {
            const table = `<mtable>${node.rows.map(r => `<mtr><mtd><mrow>${renderMathML(r)}</mrow></mtd></mtr>`).join('')}</mtable>`;
            if (node.env === 'p') return `<mo>&#x0028;</mo>${table}<mo>&#x0029;</mo>`;
            if (node.env === 'b') return `<mo>&#x005B;</mo>${table}<mo>&#x005D;</mo>`;
            return table;
        }
        return '';
    }).join('');
}

function renderOMML(nodes) { 
    if (!nodes) return '';
    return nodes.map(node => {
        // ОБНОВЛЕНО: Разделяем переменные (курсив) и обычные знаки/цифры (прямой шрифт)
        if (node.type === 'TextNode' || node.type === 'GreekNode') {
            const val = node.value;
            // Если это одиночная латинская буква (переменная), включаем для Word математический стиль
            if (/^[A-Za-z]$/.test(val)) {
                return `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>${val}</m:t></m:r>`;
            }
            // Для цифр, операторов и греческих букв оставляем стандартный вид
            return `<m:r><m:t>${val}</m:t></m:r>`;
        }
        
        if (node.type === 'GroupNode') return renderOMML(node.body);
        if (node.type === 'FractionNode') return `<m:f><m:num>${renderOMML(node.num)}</m:num><m:den>${renderOMML(node.den)}</m:den></m:f>`;
        if (node.type === 'RadicalNode') {
            if (node.deg) return `<m:rad><m:radPr></m:radPr><m:deg>${renderOMML(node.deg)}</m:deg><m:e>${renderOMML(node.body)}</m:e></m:rad>`;
            return `<m:rad><m:radPr><m:degHide m:val="on"/></m:radPr><m:deg/><m:e>${renderOMML(node.body)}</m:e></m:rad>`;
        }
        if (node.type === 'SupNode') return `<m:sSup><m:e>${renderOMML([node.base])}</m:e><m:sup>${renderOMML(node.script)}</m:sup></m:sSup>`;
        if (node.type === 'SubNode') return `<m:sSub><m:e>${renderOMML([node.base])}</m:e><m:sub>${renderOMML(node.script)}</m:sub></m:sSub>`;
        if (node.type === 'MatrixNode') {
            const table = `<m:m><m:mPr><m:baseJc m:val="center"/></m:mPr>${node.rows.map(r => `<m:mr><m:e>${renderOMML(r)}</m:e></m:mr>`).join('')}</m:m>`;
            if (node.env === 'p') return `<m:d><m:dPr><m:begChr w:val="("/><m:endChr w:val=")"/></m:dPr><m:e>${table}</m:e></m:d>`;
            if (node.env === 'b') return `<m:d><m:dPr><m:begChr w:val="["/><m:endChr w:val="]"/></m:dPr><m:e>${table}</m:e></m:d>`;
            return table;
        }
        return '';
    }).join('');
}

export function texToMathML(tex) {
    try {
        const tokens = tokenize(tex); const parser = new TeXParser(tokens); const ast = parser.parse();
        return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${renderMathML(ast)}</math>`;
    } catch (e) { return `<span style="color:red;">Ошибка MathML: ${e.message}</span>`; }
}

export function texToOMML(tex) {
    try {
        const tokens = tokenize(tex); const parser = new TeXParser(tokens); const ast = parser.parse();
        return `<m:oMath>${renderOMML(ast)}</m:oMath>`;
    } catch (e) { return `<!-- Ошибка OMML: ${e.message} -->`; }
}
