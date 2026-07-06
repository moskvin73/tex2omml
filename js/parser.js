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
            if (t === 'EOF' || t === 'RBRACE' || t === 'RBRACKET' || t === 'ALIGN' || t === 'NEWLINE') {
                break;
            }
            nodes.push(this.parseExpression());
        }
        return nodes;
    }
    parseExpression() {
       let node = null;

        // ПРОВЕРКА НА ХИМИЮ: Если формула начинается с пустой группы {} перед индексами
        if (this.peek().type === 'LBRACE' && this.tokens[this.pos + 1] && this.tokens[this.pos + 1].type === 'RBRACE') {
            this.consume('LBRACE');
            this.consume('RBRACE');
            
            // Считываем левые индексы (например, _6^{12})
            let sub = null;
            let sup = null;
            
            while (this.peek().type === 'CHAR' && (this.peek().value === '^' || this.peek().value === '_')) {
                const op = this.consume('CHAR').value;
                let script = null;
                if (this.peek().type === 'LBRACE') {
                    this.consume('LBRACE'); script = this.parse(); this.consume('RBRACE');
                } else {
                    script = [this.parsePrimary()];
                }
                if (op === '_') sub = script;
                if (op === '^') sup = script;
            }

            // Следующий за индексами символ (например, 'C') становится базой для левых индексов
            let baseNode = (this.peek().type !== 'EOF') ? this.parsePrimary() : { type: 'TextNode', value: '' };

            return {
                type: 'PreSubSupNode',
                sub: sub,
                sup: sup,
                base: baseNode
            };
        }

        // ОБЫЧНАЯ ЛОГИКА: Сначала считываем нормальную базу (символ, команду или группу)
        node = this.parsePrimary();

        // Считываем идущие подряд правые индексы (^ и _) любой вложенности
        while (this.peek().type === 'CHAR' && (this.peek().value === '^' || this.peek().value === '_')) {
            const firstOp = this.consume('CHAR').value;
            let firstScript = null;
            
            if (this.peek().type === 'LBRACE') {
                this.consume('LBRACE'); firstScript = this.parse(); this.consume('RBRACE');
            } else {
                firstScript = [this.parsePrimary()];
            }

            // Если следом идет второй индекс противоположного типа - собираем совмещенный SubSupNode
            if (this.peek().type === 'CHAR' && (this.peek().value === '^' || this.peek().value === '_') && this.peek().value !== firstOp) {
                const secondOp = this.consume('CHAR').value;
                let secondScript = null;
                
                if (this.peek().type === 'LBRACE') {
                    this.consume('LBRACE'); secondScript = this.parse(); this.consume('RBRACE');
                } else {
                    secondScript = [this.parsePrimary()];
                }

                node = {
                    type: 'SubSupNode',
                    base: node,
                    sub: firstOp === '_' ? firstScript : secondScript,
                    sup: firstOp === '^' ? firstScript : secondScript
                };
            } else {
                // Если индекс только один - создаем обычный одиночный верхний/нижний индекс
                node = {
                    type: firstOp === '^' ? 'SupNode' : 'SubNode',
                    base: node,
                    script: firstScript
                };
            }
        }
        return node;
    }
    parsePrimary() {
        const tok = this.peek();
        if (tok.type === 'CHAR' || tok.type === 'OPERATOR') { this.consume(); return { type: 'TextNode', value: tok.value }; }
        if (tok.type === 'COMMAND') {
            this.consume();
            if (tok.value === 'text') {
                this.consume('LBRACE');
                // Считываем все токены внутри \text{...} как чистый текст
                const body = [];
                while (this.pos < this.tokens.length && this.peek().type !== 'RBRACE') {
                    const nextTok = this.consume();
                    body.push(nextTok.value || '');
                }
                this.consume('RBRACE');
                // Создаем специальный узел, который защищен от курсива
                return { type: 'PlainTextNode', value: body.join('') };
            }            
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
               this.consume('LBRACE');
                const envName = this.consume('CHAR').value;
                // Считываем остаток имени окружения (например, 'atrix' для matrix или 'ases' для cases)
                let fullEnvName = envName;
                while(this.peek().type === 'CHAR') {
                    fullEnvName += this.consume().value;
                }
                this.consume('RBRACE');

                const rows = []; let currentRow = [];
                while (true) {
                    const nextTok = this.peek();
                    if (nextTok.type === 'COMMAND' && nextTok.value === 'end') break;
                    if (nextTok.type === 'ALIGN' || nextTok.type === 'NEWLINE') {
                        this.consume(); rows.push(currentRow); currentRow = [];
                    } else {
                        currentRow.push(this.parseExpression());
                    }
                }
                if (currentRow.length > 0) rows.push(currentRow);

                this.consume('COMMAND'); this.consume('LBRACE');
                while(this.peek().type === 'CHAR') this.consume();
                this.consume('RBRACE');

                // Возвращаем узел матрицы или системы уравнений
                return { type: 'MatrixNode', env: fullEnvName, rows };
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
            if (node.env === 'p' || node.env === 'pmatrix') return `<mo>&#x0028;</mo>${table}<mo>&#x0029;</mo>`;
            if (node.env === 'b' || node.env === 'bmatrix') return `<mo>&#x005B;</mo>${table}<mo>&#x005D;</mo>`;
            if (node.env === 'cases') return `<mo>&#x007B;</mo>${table}`; // Фигурная скобка только слева
            return table;
        }
        if (node.type === 'PreSubSupNode') {
            return `<mmultiscripts><mrow>${renderMathML([node.base])}</mrow><mprescripts/><mrow>${renderMathML(node.sub)}</mrow><mrow>${renderMathML(node.sup)}</mrow></mmultiscripts>`;
        }
        if (node.type === 'PlainTextNode') {
            return `<mtext>${node.value}</mtext>`;
        }      
        return '';
    }).join('');
}

function renderOMML(nodes) { 
    if (!nodes) return '';
    return nodes.map(node => {
        // ОБНОВЛЕНО: Разделяем переменные (курсив) и обычные знаки/цифры (прямой шрифт)
        if (node.type === 'TextNode' || node.type === 'GreekNode') {
           return `<m:r><m:t>${node.value}</m:t></m:r>`;
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
            if (node.env === 'p' || node.env === 'pmatrix') return `<m:d><m:dPr><m:begChr w:val="("/><m:endChr w:val=")"/></m:dPr><m:e>${table}</m:e></m:d>`;
            if (node.env === 'b' || node.env === 'bmatrix') return `<m:d><m:dPr><m:begChr w:val="["/><m:endChr w:val="]"/></m:dPr><m:e>${table}</m:e></m:d>`;
            // ИСПРАВЛЕНО: Система уравнений для Word 2010 (Фигурная скобка слева, справа пусто)
            if (node.env === 'cases') return `<m:d><m:dPr><m:begChr w:val="{"/><m:endChr w:val=""/></m:dPr><m:e>${table}</m:e></m:d>`;
            return table;
        }
        // Добавьте обработку левых индексов (m:sPre) в функцию renderOMML:
        if (node.type === 'PreSubSupNode') {
            // Структура Word 2010 для индексов СЛЕВА от базы (m:sPre)
            return `<m:sPre><m:sPrePr></m:sPrePr><m:sub>${renderOMML(node.sub)}</m:sub><m:sup>${renderOMML(node.sup)}</m:sup><m:e>${renderOMML([node.base])}</m:e></m:sPre>`;
        }
        if (node.type === 'PlainTextNode') {
            // Исправлено: текст из \text{} принудительно оборачиваем в стандартный m:r/m:t
            return `<m:r><m:t>${node.value}</m:t></m:r>`;
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
