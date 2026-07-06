// 1. Определение числовых констант типов токенов (Enum)
// Это гарантирует максимальную производительность switch-case в парсере
const TokenType = Object.freeze({
  EOF: 0,
  NEWLINE: 1,
  WHITESPACE: 2,
  COMMENT: 3,
  INLINE_MATH_LATEX_START: 4,
  INLINE_MATH_LATEX_END: 5,
  DISPLAY_MATH_LATEX_START: 6,
  DISPLAY_MATH_LATEX_END: 7,
  DISPLAY_MATH_TEX: 8,
  INLINE_MATH_TEX: 9,
  NBSP: 10,
  COMMAND: 11,
  LBRACE: 12,
  RBRACE: 13,
  LPAREN: 14,
  RPAREN: 15,
  LBRACKET: 16,
  RBRACKET: 17,
  AMPERSAND: 18,
  OPERATOR: 19,
  NUMBER: 20,
  MATH_VAR: 21,
  NON_LATIN_CHAR: 22,
  PUNCTUATION: 23,
  UNKNOWN: 24,
  GREEK_CHAR: 25
}); 

// 2. Массив для расшифровки ID токенов в понятные строки (только для логов и ошибок)
const TokenNames = Object.freeze(Object.keys(TokenType));

// 3. Класс лексического анализатора
class TeXLexer {
  constructor(input) {
    this.input = input;
    this.cursor = 0;
    
    // Человекочитаемые метрики позиции
    this.currentLine = 1;
    this.currentColumn = 1;

    // Сегментатор для честного подсчета Unicode графем (букв, сложных эмодзи)
    this.segmenter = new Intl.Segmenter();

    // Спецификация правил. Порядок критически важен.
    this.rules = [
      // Переводы строк (включая Unicode разделители U+2028 / U+2029)
      { type: TokenType.NEWLINE, regex: /\r?\n|[\u2028\u2029]/yu },
      
      // Универсальные Юникод-пробелы (\p{White_Space}), исключая новые строки
      { type: TokenType.WHITESPACE, regex: /(?:(?![\r\n\u2028\u2029])\p{White_Space})+/yu },

      // Комментарии TeX (от % до конца строки)
      { type: TokenType.COMMENT, regex: /%[^\r\n\u2028\u2029]*/yu },

      // LaTeX-маркеры математического режима (Обязательно ВЫШЕ общих команд)
      { type: TokenType.INLINE_MATH_LATEX_START, regex: /\\\(/yu },  // \(
      { type: TokenType.INLINE_MATH_LATEX_END, regex: /\\\)/yu },    // \)
      { type: TokenType.DISPLAY_MATH_LATEX_START, regex: /\\\[/yu }, // \[
      { type: TokenType.DISPLAY_MATH_LATEX_END, regex: /\\\]/yu },   // \]

      // TeX-маркеры математического режима
      { type: TokenType.DISPLAY_MATH_TEX, regex: /\$\$/yu }, // $$
      { type: TokenType.INLINE_MATH_TEX, regex: /\$/yu },    // $

      // Неразрывный пробел
      { type: TokenType.NBSP, regex: /~/yu }, // ~

      // Общие команды TeX (Макросы). Слэш + латинские буквы ИЛИ слэш + 1 любой символ
      { type: TokenType.COMMAND, regex: /\\[a-zA-Z]+|\\[^a-zA-Z]/yu },

      // Структурные символы и группировка
      { type: TokenType.LBRACE, regex: /\{/yu },
      { type: TokenType.RBRACE, regex: /\}/yu },
      { type: TokenType.LPAREN, regex: /\(/yu },
      { type: TokenType.RPAREN, regex: /\)/yu },
      { type: TokenType.LBRACKET, regex: /\[/yu },
      { type: TokenType.RBRACKET, regex: /\]/yu },
      { type: TokenType.AMPERSAND, regex: /&/yu },

      // Арифметические знаки и операторы
      { type: TokenType.OPERATOR, regex: /[+\-=<>/*!_^:]/yu },

      // Литералы и Числа
      { type: TokenType.NUMBER, regex: /\d+(?:\.\d+)?/yu },

      // Валидные латинские переменные
      { type: TokenType.MATH_VAR, regex: /\p{Script=Latin}/yu },

      // Диапазон Unicode \p{Script=Greek} выделит их в отдельный чистый токен!
      { type: TokenType.GREEK_CHAR, regex: /\p{Script=Greek}/yu },

      // Любые другие Unicode буквы (Кириллица, Армянский, Греческий и др.)
      { type: TokenType.NON_LATIN_CHAR, regex: /(?=\p{L})\P{Script=Latin}/yu },

      // Знаки препинания
      { type: TokenType.PUNCTUATION, regex: /[,.;?]/yu },

      // Безопасный перехватчик неизвестных символов (ошибки оставляет парсеру)
      { type: TokenType.UNKNOWN, regex: /./yu }
    ];
  }

  // Извлечение следующего токена (основной метод для Парсера)
  nextToken() {
    if (this.cursor >= this.input.length) {
      return { 
        type: TokenType.EOF, 
        value: null, 
        line: this.currentLine, 
        column: this.currentColumn 
      };
    }

    for (const rule of this.rules) {
      rule.regex.lastIndex = this.cursor;
      const match = rule.regex.exec(this.input);

      if (match) {
        const rawValue = match[0];
        
        // Считаем визуальные графемы (эмодзи и суррогатные пары корректно как 1 символ)
        const totalGraphemes = [...this.segmenter.segment(rawValue)].length;

        // Фиксируем координаты начала токена
        const tokenLine = this.currentLine;
        const tokenColumn = this.currentColumn;

        // Сдвигаем курсор в сырой строке JS
        this.cursor += rawValue.length;

        // Пересчитываем координаты для следующего шага
        if (rule.type === TokenType.NEWLINE) {
          this.currentLine += 1;
          this.currentColumn = 1;
        } else {
          this.currentColumn += totalGraphemes;
        }

        return {
          type: rule.type,
          value: rawValue,
          line: tokenLine,
          column: tokenColumn
        };
      }
    }
  }

  // Метод для генерации сразу всего массива (для тестов)
  tokenize() {
    const tokens = [];
    let token;
    do {
      token = this.nextToken();
      tokens.push(token);
    } while (token.type !== TokenType.EOF);
    return tokens;
  }
}

class TeXErrorCollector {
  constructor(mode = 'failFast') {
    this.mode = mode; // 'failFast' или 'accumulate'
    this.errors = [];
  }

  // Регистрация ошибки
  add(message, token) {
    const errorMsg = `[Строка ${token.line}, Колонка ${token.column}]: ${message} (найдено: "${token.value}")`;
    
    if (this.mode === 'failFast') {
      throw new SyntaxError(errorMsg);
    } else {
      this.errors.push({ message: errorMsg, line: token.line, column: token.column });
    }
  }

  // Проверка, были ли ошибки (для режима accumulate)
  hasErrors() {
    return this.errors.length > 0;
  }

  // Получить список всех ошибок строкой
  getSummary() {
    return this.errors.map(e => e.message).join('\n');
  }
}

const TeXSymbols = {
  // ==========================================
  // 1. ГРЕЧЕСКИЙ АЛФАВИТ (MathSymbolNode)
  // ==========================================
  // Строчные
  '\\alpha': { type: 'MathSymbolNode', val: 'α' },
  '\\beta': { type: 'MathSymbolNode', val: 'β' },
  '\\gamma': { type: 'MathSymbolNode', val: 'γ' },
  '\\delta': { type: 'MathSymbolNode', val: 'δ' },
  '\\epsilon': { type: 'MathSymbolNode', val: 'ε' },
  '\\varepsilon': { type: 'MathSymbolNode', val: 'ϵ' },
  '\\zeta': { type: 'MathSymbolNode', val: 'ζ' },
  '\\eta': { type: 'MathSymbolNode', val: 'η' },
  '\\theta': { type: 'MathSymbolNode', val: 'θ' },
  '\\vartheta': { type: 'MathSymbolNode', val: 'ϑ' },
  '\\iota': { type: 'MathSymbolNode', val: 'ι' },
  '\\kappa': { type: 'MathSymbolNode', val: 'κ' },
  '\\lambda': { type: 'MathSymbolNode', val: 'λ' },
  '\\mu': { type: 'MathSymbolNode', val: 'μ' },
  '\\nu': { type: 'MathSymbolNode', val: 'ν' },
  '\\xi': { type: 'MathSymbolNode', val: 'ξ' },
  '\\pi': { type: 'MathSymbolNode', val: 'π' },
  '\\rho': { type: 'MathSymbolNode', val: 'ρ' },
  '\\sigma': { type: 'MathSymbolNode', val: 'σ' },
  '\\tau': { type: 'MathSymbolNode', val: 'τ' },
  '\\upsilon': { type: 'MathSymbolNode', val: 'υ' },
  '\\phi': { type: 'MathSymbolNode', val: 'φ' },
  '\\varphi': { type: 'MathSymbolNode', val: 'ϕ' },
  '\\chi': { type: 'MathSymbolNode', val: 'χ' },
  '\\psi': { type: 'MathSymbolNode', val: 'ψ' },
  '\\omega': { type: 'MathSymbolNode', val: 'ω' },
  // Заглавные
  '\\Gamma': { type: 'MathSymbolNode', val: 'Γ' },
  '\\Delta': { type: 'MathSymbolNode', val: 'Δ' },
  '\\Theta': { type: 'MathSymbolNode', val: 'Θ' },
  '\\Lambda': { type: 'MathSymbolNode', val: 'Λ' },
  '\\Xi': { type: 'MathSymbolNode', val: 'Ξ' },
  '\\Pi': { type: 'MathSymbolNode', val: 'Π' },
  '\\Sigma': { type: 'MathSymbolNode', val: 'Σ' },
  '\\Upsilon': { type: 'MathSymbolNode', val: 'Υ' },
  '\\Phi': { type: 'MathSymbolNode', val: 'Φ' },
  '\\Psi': { type: 'MathSymbolNode', val: 'Ψ' },
  '\\Omega': { type: 'MathSymbolNode', val: 'Ω' },

  // ==========================================
  // 2. СТАНДАРТНЫЕ ФУНКЦИИ (FunctionNode)
  // ==========================================
  // Тригонометрия
  '\\sin': { type: 'FunctionNode', val: 'sin' },
  '\\cos': { type: 'FunctionNode', val: 'cos' },
  '\\tan': { type: 'FunctionNode', val: 'tan' },
  '\\cot': { type: 'FunctionNode', val: 'cot' },
  '\\sec': { type: 'FunctionNode', val: 'sec' },
  '\\csc': { type: 'FunctionNode', val: 'csc' },
  '\\tg': { type: 'FunctionNode', val: 'tg' },   // Русская традиция
  '\\ctg': { type: 'FunctionNode', val: 'ctg' }, // Русская традиция
  // Обратные тригонометрические
  '\\arcsin': { type: 'FunctionNode', val: 'arcsin' },
  '\\arccos': { type: 'FunctionNode', val: 'arccos' },
  '\\arctan': { type: 'FunctionNode', val: 'arctan' },
  '\\arctg': { type: 'FunctionNode', val: 'arctg' },
  // Гиперболические
  '\\sinh': { type: 'FunctionNode', val: 'sinh' },
  '\\cosh': { type: 'FunctionNode', val: 'cosh' },
  '\\tanh': { type: 'FunctionNode', val: 'tanh' },
  '\\coth': { type: 'FunctionNode', val: 'coth' },
  // Логарифмы, пределы и база
  '\\ln': { type: 'FunctionNode', val: 'ln' },
  '\\log': { type: 'FunctionNode', val: 'log' },
  '\\lg': { type: 'FunctionNode', val: 'lg' },
  '\\lim': { type: 'FunctionNode', val: 'lim' },
  '\\exp': { type: 'FunctionNode', val: 'exp' },
  '\\det': { type: 'FunctionNode', val: 'det' },
  '\\deg': { type: 'FunctionNode', val: 'deg' },
  '\\arg': { type: 'FunctionNode', val: 'arg' },
  '\\dim': { type: 'FunctionNode', val: 'dim' },
  '\\hom': { type: 'FunctionNode', val: 'hom' },
  '\\ker': { type: 'FunctionNode', val: 'ker' },
  '\\max': { type: 'FunctionNode', val: 'max' },
  '\\min': { type: 'FunctionNode', val: 'min' },
  '\\sup': { type: 'FunctionNode', val: 'sup' },
  '\\inf': { type: 'FunctionNode', val: 'inf' },
  '\\gcd': { type: 'FunctionNode', val: 'gcd' },

  // ==========================================
  // 3. МАТЕМАТИЧЕСКИЕ ОПЕРАТОРЫ И СТРЕЛКИ (OperatorNode)
  // ==========================================
  // Стрелки
  '\\rightarrow': { type: 'OperatorNode', val: '→' },
  '\\to': { type: 'OperatorNode', val: '→' },
  '\\leftarrow': { type: 'OperatorNode', val: '←' },
  '\\leftrightarrow': { type: 'OperatorNode', val: '↔' },
  '\\Rightarrow': { type: 'OperatorNode', val: '⇒' },
  '\\Leftarrow': { type: 'OperatorNode', val: '⇐' },
  '\\Leftrightarrow': { type: 'OperatorNode', val: '⇔' },
  '\\uparrow': { type: 'OperatorNode', val: '↑' },
  '\\downarrow': { type: 'OperatorNode', val: '↓' },
  // Знаки отношений и сравнения
  '\\le': { type: 'OperatorNode', val: '≤' },
  '\\leq': { type: 'OperatorNode', val: '≤' },
  '\\ge': { type: 'OperatorNode', val: '≥' },
  '\\geq': { type: 'OperatorNode', val: '≥' },
  '\\neq': { type: 'OperatorNode', val: '≠' },
  '\\ne': { type: 'OperatorNode', val: '≠' },
  '\\approx': { type: 'OperatorNode', val: '≈' },
  '\\sim': { type: 'OperatorNode', val: '~' },
  '\\equiv': { type: 'OperatorNode', val: '≡' },
  '\\propto': { type: 'OperatorNode', val: '∝' },
  '\\parallel': { type: 'OperatorNode', val: '∥' },
  '\\perp': { type: 'OperatorNode', val: '⊥' },
  // Бинарные операции и знаки умножения/деления
  '\\cdot': { type: 'OperatorNode', val: '·' },
  '\\times': { type: 'OperatorNode', val: '×' },
  '\\div': { type: 'OperatorNode', val: '÷' },
  '\\pm': { type: 'OperatorNode', val: '±' },
  '\\mp': { type: 'OperatorNode', val: '∓' },
  '\\ast': { type: 'OperatorNode', val: '∗' },
  '\\star': { type: 'OperatorNode', val: '★' },
  '\\circ': { type: 'OperatorNode', val: '◦' },
  '\\bullet': { type: 'OperatorNode', val: '•' },
  // Множества и логика
  '\\in': { type: 'OperatorNode', val: '∈' },
  '\\notin': { type: 'OperatorNode', val: '∉' },
  '\\subset': { type: 'OperatorNode', val: '⊂' },
  '\\supset': { type: 'OperatorNode', val: '⊃' },
  '\\subseteq': { type: 'OperatorNode', val: '⊆' },
  '\\supseteq': { type: 'OperatorNode', val: '⊇' },
  '\\cap': { type: 'OperatorNode', val: '∩' },
  '\\cup': { type: 'OperatorNode', val: '∪' },
  '\\setminus': { type: 'OperatorNode', val: '∖' },
  '\\forall': { type: 'OperatorNode', val: '∀' },
  '\\exists': { type: 'OperatorNode', val: '∃' },
  '\\empty': { type: 'OperatorNode', val: '∅' },
  '\\emptyset': { type: 'OperatorNode', val: '∅' },
  '\\nabla': { type: 'OperatorNode', val: '∇' },
  '\\partial': { type: 'OperatorNode', val: '∂' },
  
  // Крупные исчисления (К ним индексы лепятся сверху и снизу автоматически)
  '\\sum': { type: 'OperatorNode', val: '∑' },
  '\\prod': { type: 'OperatorNode', val: '∏' },
  '\\int': { type: 'OperatorNode', val: '∫' },
  '\\iint': { type: 'OperatorNode', val: '∬' },
  '\\iiint': { type: 'OperatorNode', val: '∭' },
  '\\oint': { type: 'OperatorNode', val: '∮' },
  '\\infty': { type: 'OperatorNode', val: '∞' },

  '\\,': { type: 'OperatorNode', val: ' ' }, // Здесь внутри кавычек сидит Unicode тонкий пробел (Thin Space, U+2009)
  '\\,': { type: 'OperatorNode', val: ' ' }, // Тонкий пробел (Thin Space, U+2009)
  '\\:': { type: 'OperatorNode', val: ' ' }, // Средний пробел (Medium Space, U+205F)
  '\\;': { type: 'OperatorNode', val: ' ' }, // Толстый пробел (Thick Space, U+2005)
  '\\!': { type: 'OperatorNode', val: '' },  // Отрицательный пробел (ужимает текст, в Юникоде аналога нет, делаем пустым)
  '\\quad': { type: 'OperatorNode', val: ' ' }, // Широкий пробел (Размером в букву M, U+2003)
  '\\qquad': { type: 'OperatorNode', val: '  ' }, // Удвоенный широкий пробел  

  '\\{': { type: 'OperatorNode', val: '{' },
  '\\}': { type: 'OperatorNode', val: '}' },
  '\\%': { type: 'OperatorNode', val: '%' },
  '\\&': { type: 'OperatorNode', val: '&' },
  '\\_': { type: 'OperatorNode', val: '_' },
  '\\#': { type: 'OperatorNode', val: '#' },
  '\\$': { type: 'OperatorNode', val: '$' },
  
  // Знаки для химии (OperatorNode)
  '\\uparrow': { type: 'OperatorNode', val: '↑' },   // Выделение газа
  '\\downarrow': { type: 'OperatorNode', val: '↓' }, // Выпадение осадка
  '\\degree': { type: 'OperatorNode', val: '°' },    // Значок градуса (для температуры над стрелкой)
  
  // Многоточия (OperatorNode)
  '\\dots': { type: 'OperatorNode', val: '…' },  // Обычное многоточие
  '\\cdots': { type: 'OperatorNode', val: '⋯' }, // Многоточие по центру строки (для матриц и рядов)
  '\\vdots': { type: 'OperatorNode', val: '⋮' }, // Вертикальное многоточие (для матриц)
  '\\ddots': { type: 'OperatorNode', val: '⋱' }, // Диагональное многоточие (для матриц)  
};

class TeXParser {
  // Конструктор принимает наш лексер и менеджер ошибок (ErrorCollector)
  constructor(lexer, errorCollector) {
    this.lexer = lexer;
    this.errors = errorCollector;
    
    this.currentToken = null;
    this.lookaheadToken = null;
    
    // Флаг состояния: true, если парсер зашел внутрь формулы ($ или \()
    this.isInMathMode = false;

    // Инициализируем поток: читаем первый токен и заглядываем на один вперед
    this.nextToken();
    this.lookahead();
  }

  // Сдвиг по ленте токенов: текущим становится тот, что был впереди
  nextToken() {
    this.currentToken = this.lookaheadToken ? this.lookaheadToken : this.lexer.nextToken();
    this.lookaheadToken = null;
  }

  // Заглядывание вперед на +1 токен без изменения позиции текущего
  lookahead() {
    if (!this.lookaheadToken) {
      this.lookaheadToken = this.lexer.nextToken();
    }
    return this.lookaheadToken;
  }

  // Метод валидации: проверяет тип токена и поглощает его.
  // Если тип не совпал, регистрирует ошибку и пытается восстановиться.
  eat(expectedType) {
    if (this.currentToken.type !== expectedType) {
      this.errors.add(`Ожидался токен ${TokenNames[expectedType]}`, this.currentToken);
      this.recoverAfterMismatch(expectedType);
    } else {
      this.nextToken();
      this.lookahead();
    }
  }

  // Паническое восстановление при несовпадении токена
  recoverAfterMismatch(expectedType) {
    // Если мы ждали закрытия режима или группы, просто симулируем, что нашли её
    if (expectedType === TokenType.RBRACE || expectedType === TokenType.INLINE_MATH_TEX) {
      return; 
    }
    // В остальных случаях безопасно пропускаем один ошибочный токен
    this.nextToken();
    this.lookahead();
  }

  // ГЛАВНАЯ ТОЧКА ВХОДА: разбирает всю строку до конца файла (EOF)
  parse() {
    const nodes = [];
    while (this.currentToken.type !== TokenType.EOF) {
      // Если токен открывает математику — парсим как формулу
      if (this.isMathStartToken(this.currentToken.type)) {
        nodes.push(this.parseMathBlock());
      } else {
        // Иначе — собираем как обычный текст вне формулы
        const textNode = this.parsePlainText();
        if (textNode) nodes.push(textNode);
      }
    }
    return nodes;
  }

  // Вспомогательный метод: проверяет, является ли токен маркером начала формулы
  isMathStartToken(type) {
    return type === TokenType.INLINE_MATH_TEX || 
           type === TokenType.DISPLAY_MATH_TEX ||
           type === TokenType.INLINE_MATH_LATEX_START ||
           type === TokenType.DISPLAY_MATH_LATEX_START;
  }

  // Вспомогательный метод: возвращает парный закрывающий токен для открывающего
  getMatchingMathEndToken(startType) {
    if (startType === TokenType.INLINE_MATH_TEX) return TokenType.INLINE_MATH_TEX;
    if (startType === TokenType.DISPLAY_MATH_TEX) return TokenType.DISPLAY_MATH_TEX;
    if (startType === TokenType.INLINE_MATH_LATEX_START) return TokenType.INLINE_MATH_LATEX_END;
    if (startType === TokenType.DISPLAY_MATH_LATEX_START) return TokenType.DISPLAY_MATH_LATEX_END;
  }
  
  // 1. Парсинг обычного текста вне математических формул
  parsePlainText() {
    let text = '';
    // Собираем текст, пока не дойдем до конца файла или до начала новой формулы
    while (this.currentToken.type !== TokenType.EOF && !this.isMathStartToken(this.currentToken.type)) {
      text += this.currentToken.value;
      this.nextToken();
      this.lookahead();
    }
    // Возвращаем узел PlainTextNode, если текст не пустой
    return text ? { type: 'PlainTextNode', value: text } : null;
  }

  // 2. Парсинг математического блока целиком (все, что внутри $...$, $$...$$, \(...\) или \[...\])
  parseMathBlock() {
    const startToken = this.currentToken;
    const endType = this.getMatchingMathEndToken(startToken.type);
    
    this.eat(startToken.type); // Поглощаем открывающий маркер (например, $)
    
    const oldMathMode = this.isInMathMode;
    this.isInMathMode = true; // Запоминаем, что мы вошли в режим математики

    const body = [];
    
    // Собираем элементы формулы, пока не встретим закрывающий маркер или конец файла
    while (this.currentToken.type !== endType && this.currentToken.type !== TokenType.EOF) {
      try {
        const node = this.parseMathExpression();
        if (node) body.push(node);
      } catch (err) {
        // Если произошла фатальная ошибка парсинга в режиме 'failFast' (проброшенная из Collector),
        // она прервет выполнение. В режиме 'accumulate' мы перехватываем её здесь для восстановления.
        if (this.errors.mode === 'failFast') throw err;
        this.recoverInsideMath(endType);
      }
    }

    this.isInMathMode = oldMathMode; // Восстанавливаем предыдущий контекст
    this.eat(endType); // Поглощаем закрывающий маркер формулы

    // Возвращаем группу, содержащую внутренности формулы
    return { type: 'GroupNode', body: body };
  }

  // 3. Основной цикл разбора математических выражений
  parseMathExpression() {
    // В классическом TeX пробелы и переносы строк в формулах игнорируются.
    // Просто пропускаем их и двигаемся дальше.
    if (this.currentToken.type === TokenType.WHITESPACE || this.currentToken.type === TokenType.NEWLINE) {
      this.nextToken();
      this.lookahead();
      return null;
    }

    // Шаг А: Разбираем базовый элемент (число, переменную, команду вроде \frac)
    let node = this.parsePrimaryMathElement();

    // Шаг Б: Проверяем, идут ли сразу за этим элементом верхние или нижние индексы (^ или _)
    if (node && (this.currentToken.type === TokenType.OPERATOR && 
        (this.currentToken.value === '^' || this.currentToken.value === '_'))) {
      node = this.parseScripts(node);
    }

    return node;
  }

  // 4. Паническое восстановление внутри математического режима (для режима accumulate)
  recoverInsideMath(endType) {
    // Пропускаем токены, пока не найдем безопасную точку остановки:
    // закрывающий маркер формулы, закрывающую фигурную скобку или конец файла
    while (this.currentToken.type !== TokenType.EOF && 
           this.currentToken.type !== endType && 
           this.currentToken.type !== TokenType.RBRACE) {
      this.nextToken();
      this.lookahead();
    }
  }
  
  // 1. Разбор базовых (атомарных) элементов математического режима
  parsePrimaryMathElement() {
    const token = this.currentToken;

    switch (token.type) {
        case TokenType.NUMBER:
          this.nextToken(); this.lookahead();
          return { type: 'NumberNode', value: token.value };

        case TokenType.MATH_VAR:
          this.nextToken(); this.lookahead();
          return { type: 'VariableNode', value: token.value };

        // ОБРАБОТКА ЖИВОЙ ГРЕЧЕСКОЙ БУКВЫ ИЗ ЛЕКСЕРА:
        case TokenType.GREEK_CHAR:
          const greekChar = token.value;
          this.nextToken(); this.lookahead();
          // Сразу отдаем в рендерер как правильный математический символ
          return { type: 'MathSymbolNode', value: greekChar };          

        case TokenType.OPERATOR:
          this.nextToken(); this.lookahead();
          return { type: 'OperatorNode', value: token.value };

        case TokenType.PUNCTUATION:
          this.nextToken(); this.lookahead();
          // Знаки препинания (запятая, точка с запятой) в MathML семантически являются операторами <mo>
          return { type: 'OperatorNode', value: token.value };

        case TokenType.NON_LATIN_CHAR:
          this.errors.add(`Нелатинский символ "${token.value}" запрещен в математическом режиме. Используйте \\text{...}`, token);
          this.nextToken(); this.lookahead();
          return { type: 'VariableNode', value: token.value };

        case TokenType.LBRACE:
          this.eat(TokenType.LBRACE);
          const groupBody = [];
          while (this.currentToken.type !== TokenType.RBRACE && this.currentToken.type !== TokenType.EOF) {
            const expr = this.parseMathExpression();
            if (expr) groupBody.push(expr);
          }
          this.eat(TokenType.RBRACE);
          return { type: 'GroupNode', body: groupBody };

      // =========================================================================
        // ОБРАБОТКА ОБЫЧНЫХ СКОБОК (Теперь они гарантированно станут OperatorNode -> <mo>)
        // =========================================================================
        case TokenType.LPAREN:
        case TokenType.RPAREN:
        case TokenType.LBRACKET:
        case TokenType.RBRACKET:
          const bracketVal = token.value;
          this.nextToken(); this.lookahead();
          return { type: 'OperatorNode', value: bracketVal };

        // =========================================================================
        // ОБРАБОТКА МАСШТАБИРУЕМЫХ СКОБОК \left ... \right
        // =========================================================================
        case TokenType.LEFT_BRACKET_CMD:
          this.eat(TokenType.LEFT_BRACKET_CMD); // Поглощаем \left
          
          // Символ открывающей скобки (это может быть знак (, [, {, команду \{ и т.д.)
          const openDelimiter = this.currentToken.value;
          this.nextToken(); this.lookahead(); // Поглощаем символ скобки

          const fencedBody = [];
          
          // Собираем выражение внутри, пока не упремся в \right или конец файла
          while (this.currentToken.type !== TokenType.RIGHT_BRACKET_CMD && this.currentToken.type !== TokenType.EOF) {
            try {
              const expr = this.parseMathExpression();
              if (expr) fencedBody.push(expr);
            } catch (err) {
              if (this.errors.mode === 'failFast') throw err;
              this.recoverInsideMath(TokenType.RIGHT_BRACKET_CMD);
            }
          }

          this.eat(TokenType.RIGHT_BRACKET_CMD); // Поглощаем \right
          
          // Символ закрывающей скобки (например, ) или . )
          const closeDelimiter = this.currentToken.value;
          this.nextToken(); this.lookahead(); // Поглощаем его

          // Очищаем скобки от слэшей для рендереров (например, '\{' превращаем в '{')
          const cleanOpen = openDelimiter.replace('\\', '');
          const cleanClose = closeDelimiter.replace('\\', '');

          return { 
            type: 'FencedNode', 
            open: cleanOpen, 
            // В TeX точка означает отсутствие скобки (для систем уравнений), передаем как пустую строку
            close: cleanClose === '.' ? '' : cleanClose, 
            body: fencedBody 
          };          

        case TokenType.COMMAND:
          return this.parseCommand();

        default:
          const unknownVal = this.currentToken.value;
          this.nextToken(); this.lookahead();
          return { type: 'VariableNode', value: unknownVal };
      }
  }
 
  // 1. Главный диспетчер макросов (команд, начинающихся с '\')
  parseCommand() {
    const cmdToken = this.currentToken;
    const cmdName = cmdToken.value; // Например, "\frac" или "\alpha"
    this.eat(TokenType.COMMAND);

    // А. Текстовая вставка \text{...} — временно отключает правила математики
    if (cmdName === '\\text') {
      this.eat(TokenType.LBRACE);
      let textContent = '';
      
      // Внутри \text мы считываем ВСЕ токены как сырой текст, включая пробелы и кириллицу
      while (this.currentToken.type !== TokenType.RBRACE && this.currentToken.type !== TokenType.EOF) {
        textContent += this.currentToken.value;
        this.nextToken();
        this.lookahead();
      }
      this.eat(TokenType.RBRACE);
      return { type: 'PlainTextNode', value: textContent };
    }

    // Б. Дробь \frac{числитель}{знаменатель}
    if (cmdName === '\\frac') {
      this.eat(TokenType.LBRACE);
      const num = this.parseGroupContent(); // Парсим числитель
      this.eat(TokenType.RBRACE);

      this.eat(TokenType.LBRACE);
      const den = this.parseGroupContent(); // Парсим знаменатель
      this.eat(TokenType.RBRACE);

      return { type: 'FractionNode', num: num, den: den };
    }

    // В. Квадратный или n-ый корень \sqrt[степень]{тело}
    if (cmdName === '\\sqrt') {
      let deg = null;
      
      // Если сразу после \sqrt идет квадратная скобка '[', значит указана степень корня
      if (this.currentToken.type === TokenType.LBRACKET) {
        this.eat(TokenType.LBRACKET);
        deg = [];
        while (this.currentToken.type !== TokenType.RBRACKET && this.currentToken.type !== TokenType.EOF) {
          const expr = this.parseMathExpression();
          if (expr) deg.push(expr);
        }
        this.eat(TokenType.RBRACKET);
      }
      
      this.eat(TokenType.LBRACE);
      const body = this.parseGroupContent(); // Парсим подкоренное выражение
      this.eat(TokenType.RBRACE);

      return { type: 'RadicalNode', body: body, deg: deg };
    }

    // Г. Пре-индексы \prescript{верхний}{нижний}{база}
    if (cmdName === '\\prescript') {
      this.eat(TokenType.LBRACE);
      const sup = this.parseGroupContent();
      this.eat(TokenType.RBRACE);

      this.eat(TokenType.LBRACE);
      const sub = this.parseGroupContent();
      this.eat(TokenType.RBRACE);

      // Парсим базовый элемент, к которому эти пре-индексы лепятся (например, переменную 'X')
      const base = this.parseMathExpression(); 

      return { type: 'PreSubSupNode', base: base, sub: sub, sup: sup };
    }

    // Д. Матрицы и системы уравнений \begin{matrix} ... \end{matrix}
    if (cmdName === '\\begin') {
      this.eat(TokenType.LBRACE);
      let envName = '';
      while (this.currentToken.type !== TokenType.RBRACE && this.currentToken.type !== TokenType.EOF) {
        envName += this.currentToken.value;
        this.nextToken();
      }
      this.eat(TokenType.RBRACE);

      // Передаем управление специализированному парсеру матричных строк
      const rows = this.parseMatrixRows(envName);

      return { type: 'MatrixNode', env: envName, rows: rows };
    }

    // Проверяем команду по нашей семантической таблице
    if (TeXSymbols[cmdName]) {
      const match = TeXSymbols[cmdName];
      return { type: match.type, value: match.val };
    }

    // Если команда вообще неизвестна (\unknown), отдаем как базовый оператор/функцию
    return { type: 'FunctionNode', value: cmdName };
  }

  // 2. Вспомогательный метод быстрого сбора содержимого внутри фигурных скобок {...}
  parseGroupContent() {
    const content = [];
    while (this.currentToken.type !== TokenType.RBRACE && this.currentToken.type !== TokenType.EOF) {
      const expr = this.parseMathExpression();
      if (expr) content.push(expr);
    }
    return content;
  }

  // 1. Парсинг верхних и нижних индексов (^ и _)
  parseScripts(baseNode) {
   let sub = null; // Для хранения нижнего индекса
    let sup = null; // Для хранения верхнего индекса

    // Проверяем первый символ индекса сразу за базой
    while (this.currentToken.type === TokenType.OPERATOR && 
          (this.currentToken.value === '^' || this.currentToken.value === '_')) {
      
      const isSup = this.currentToken.value === '^';
      this.eat(TokenType.OPERATOR); // Поглощаем знак ^ или _

      let scriptContent = [];
      
      // Если индекс обернут в скобки (например, x^{2}), парсим все внутри скобок
      if (this.currentToken.type === TokenType.LBRACE) {
        this.eat(TokenType.LBRACE);
        scriptContent = this.parseGroupContent();
        this.eat(TokenType.RBRACE);
      } else {
        // Если индекс без скобок (например, x^2), берем строго один атомарный элемент
        const prim = this.parsePrimaryMathElement();
        if (prim) scriptContent.push(prim);
      }

      // Записываем индекс и проверяем на повторения
      if (isSup) {
        if (sup) {
          this.errors.add("Двойной верхний индекс запрещен в TeX. Используйте группировку {...}", this.currentToken);
        }
        sup = scriptContent;
      } else {
        if (sub) {
          this.errors.add("Двойной нижний индекс запрещен в TeX. Используйте группировку {...}", this.currentToken);
        }
        sub = scriptContent;
      }
    }

    // =========================================================================
    // КРИТИЧЕСКАЯ СЕМАНТИЧЕСКАЯ ПРОВЕРКА ДЛЯ КРУПНЫХ ОПЕРАТОРОВ (lim, sum, prod)
    // =========================================================================
    // Проверяем текстовое значение БАЗЫ (baseNode.value). 
    // Если база существует и её значение требует вертикального размещения:
    const verticalOperators = ['lim', '∑', '∏', 'max', 'min', 'sup', 'inf'];
    
    if (baseNode && verticalOperators.includes(baseNode.value)) {
      // Возвращаем специализированный узел UnderOverNode под/над строчных индексов
      return { type: 'UnderOverNode', base: baseNode, sub: sub, sup: sup };
    }

    // =========================================================================
    // КЛАССИЧЕСКИЕ БОКОВЫЕ ИНДЕКСЫ (для переменных, химии и интегралов \int)
    // =========================================================================
    if (sub && sup) {
      return { type: 'SubSupNode', base: baseNode, sub: sub, sup: sup };
    } else if (sup) {
      return { type: 'SupNode', base: baseNode, script: sup };
    } else if (sub) {
      return { type: 'SubNode', base: baseNode, script: sub };
    }
    
    return baseNode;
  }

  // 2. Разбор матриц и окружений типа \begin{matrix} ... \end{matrix}
  parseMatrixRows(envName) {
    const rows = [];
    let currentRow = [];

    while (this.currentToken.type !== TokenType.EOF) {
      // Проверяем, не дошли ли мы до закрывающего тега \end{имя_окружения}
      if (this.currentToken.type === TokenType.COMMAND && this.currentToken.value === '\\end') {
        this.eat(TokenType.COMMAND);
        this.eat(TokenType.LBRACE);
        
        let endEnvName = '';
        while (this.currentToken.type !== TokenType.RBRACE && this.currentToken.type !== TokenType.EOF) {
          endEnvName += this.currentToken.value;
          this.nextToken();
        }
        this.eat(TokenType.RBRACE);

        // Проверяем валидность структуры: имя в \begin должно строго совпадать с \end
        if (endEnvName !== envName) {
          this.errors.add(`Нарушена вложенность: открыто \\begin{${envName}}, но закрыто \\end{${endEnvName}}`, this.currentToken);
        }

        // Перед выходом пушим последнюю строку, если в ней есть данные
        if (currentRow.length > 0) rows.push(currentRow);
        return rows;
      }

      // Перенос строки в матрице (команда \\)
      if (this.currentToken.type === TokenType.COMMAND && this.currentToken.value === '\\\\') {
        rows.push(currentRow); // Сохраняем готовую строку в массив строк матрицы
        currentRow = [];       // Очищаем для следующей строки
        this.eat(TokenType.COMMAND);
        continue;
      }

      // Разделитель ячеек в строке (знак &)
      if (this.currentToken.type === TokenType.AMPERSAND) {
        this.eat(TokenType.AMPERSAND);
        continue; // Просто пропускаем амперсанд, текущая ячейка продолжается или начнется новая
      }

      // Игнорируем пробелы и переносы кода внутри матрицы
      if (this.currentToken.type === TokenType.WHITESPACE || this.currentToken.type === TokenType.NEWLINE) {
        this.nextToken();
        this.lookahead();
        continue;
      }

      // Парсим обычные математические выражения внутри ячеек матрицы
      try {
        const expr = this.parseMathExpression();
        if (expr) currentRow.push(expr);
      } catch (err) {
        if (this.errors.mode === 'failFast') throw err;
        this.recoverInsideMath(TokenType.COMMAND); // Перематываем до следующей команды (например, \\ или \end)
      }
    }

    // Если файл кончился, а \end не найден — это ошибка структуры
    this.errors.add(`Окружение \\begin{${envName}} не закрыто соответствующей командой \\end`, this.currentToken);
    return rows;
  }  
}

// 3. ГЕНЕРАТОРЫ КОДА
function renderMathML(nodes) {
    if (!nodes) return '';
    return nodes.map(node => {
        if (node.type === 'VariableNode')   return `<mi>${node.value}</mi>`; 
        if (node.type === 'MathSymbolNode') return `<mi>${node.value}</mi>`; // Греческие буквы тоже <mi>
        if (node.type === 'NumberNode')     return `<mn>${node.value}</mn>`;
        if (node.type === 'OperatorNode')   return `<mo>${node.value}</mo>`;
        if (node.type === 'FunctionNode')   return `<mo>${node.value}</mo>`; // Функции тоже в <mo>
        if (node.type === 'PlainTextNode')  return `<mtext>${node.value}</mtext>`;        
        if (node.type === 'PlainTextNode') return `<mtext>${node.value}</mtext>`;
        if (node.type === 'GroupNode') return `<mrow>${renderMathML(node.body)}</mrow>`;
        if (node.type === 'FractionNode') return `<mfrac><mrow>${renderMathML(node.num)}</mrow><mrow>${renderMathML(node.den)}</mrow></mfrac>`;
        if (node.type === 'RadicalNode') {
            if (node.deg) return `<mroot><mrow>${renderMathML(node.body)}</mrow><mrow>${renderMathML(node.deg)}</mrow></mroot>`;
            return `<msqrt><mrow>${renderMathML(node.body)}</mrow></msqrt>`;
        }
        if (node.type === 'SupNode') return `<msup><mrow>${renderMathML([node.base])}</mrow><mrow>${renderMathML(node.script)}</mrow></msup>`;
        if (node.type === 'SubNode') return `<msub><mrow>${renderMathML([node.base])}</mrow><mrow>${renderMathML(node.script)}</mrow></msub>`;
        if (node.type === 'SubSupNode') return `<msubsup><mrow>${renderMathML([node.base])}</mrow><mrow>${renderMathML(node.sub)}</mrow><mrow>${renderMathML(node.sup)}</mrow></msubsup>`;
        if (node.type === 'PreSubSupNode') return `<mmultiscripts><mrow>${renderMathML([node.base])}</mrow><mprescripts/><mrow>${renderMathML(node.sub)}</mrow><mrow>${renderMathML(node.sup)}</mrow></mmultiscripts>`;
        if (node.type === 'UnderOverNode') {
            // Если есть и верхний, и нижний лимит (например, сумма от i=1 до n)
            if (node.sub && node.sup) {
                return `<munderover><mrow>${renderMathML([node.base])}</mrow><mrow>${renderMathML(node.sub)}</mrow><mrow>${renderMathML(node.sup)}</mrow></munderover>`;
            }
            // Если есть только нижний лимит (например, предел x -> 0)
            if (node.sub) {
                return `<munder><mrow>${renderMathML([node.base])}</mrow><mrow>${renderMathML(node.sub)}</mrow></munder>`;
            }
            // Если есть только верхний лимит
            if (node.sup) {
                return `<mover><mrow>${renderMathML([node.base])}</mrow><mrow>${renderMathML(node.sup)}</mrow></mover>`;
            }
        }
        if (node.type === 'FencedNode') {
          return `<mfenced open="${node.open}" close="${node.close}"><mrow>${renderMathML(node.body)}</mrow></mfenced>`;
        }
        if (node.type === 'MatrixNode') {
            const table = `<mtable>${node.rows.map(r => `<mtr><mtd><mrow>${renderMathML(r)}</mrow></mtd></mtr>`).join('')}</mtable>`;
            if (node.env === 'p' || node.env === 'pmatrix') return `<mo>&#x0028;</mo>${table}<mo>&#x0029;</mo>`;
            if (node.env === 'b' || node.env === 'bmatrix') return `<mo>&#x005B;</mo>${table}<mo>&#x005D;</mo>`;
            if (node.env === 'cases') return `<mo>&#x007B;</mo>${table}`;
            return table;
        }
        return '';
    }).join('');
}

const span_omml = `<span style='font-family:"Cambria Math","serif";'>`;

function renderOMML(nodes) {
    if (!nodes) return '';
    return nodes.map(node => {
        // Только VariableNode (латиница) получает тег курсива <i>
        if (node.type === 'VariableNode' || 
            node.type === 'MathSymbolNode') {
            return `<m:r><m:t><i><span style='font-family:"Cambria Math","serif";'>${node.value}</span></i></m:t></m:r>`;
        }
        
        // Все остальные атомарные узлы выводятся строго ПРЯМЫМ шрифтом
        if (node.type === 'NumberNode'     || 
            node.type === 'OperatorNode'   || 
            node.type === 'FunctionNode'   || 
            node.type === 'PlainTextNode') {
            return `<m:r><m:t><span style='font-family:"Cambria Math","serif";'>${node.value}</span></m:t></m:r>`;
        }
        if (node.type === 'GroupNode') return renderOMML(node.body);
        if (node.type === 'FractionNode') return `<m:f><m:num>${renderOMML(node.num)}</m:num><m:den>${renderOMML(node.den)}</m:den></m:f>`;
        if (node.type === 'RadicalNode') {
            if (node.deg) return `<m:rad><m:radPr></m:radPr><m:deg>${renderOMML(node.deg)}</m:deg><m:e>${renderOMML(node.body)}</m:e></m:rad>`;
            return `<m:rad><m:radPr><m:degHide m:val="on"/></m:radPr><m:deg/><m:e>${renderOMML(node.body)}</m:e></m:rad>`;
        }
        if (node.type === 'SupNode') return `<m:sSup><m:e>${renderOMML([node.base])}</m:e><m:sup>${renderOMML(node.script)}</m:sup></m:sSup>`;
        if (node.type === 'SubNode') return `<m:sSub><m:e>${renderOMML([node.base])}</m:e><m:sub>${renderOMML(node.script)}</m:sub></m:sSub>`;
        if (node.type === 'SubSupNode') return `<m:sSubSup><m:sSubSupPr></m:sSubSupPr><m:e>${renderOMML([node.base])}</m:e><m:sub>${renderOMML(node.sub)}</m:sub><m:sup>${renderOMML(node.sup)}</m:sup></m:sSubSup>`;
        if (node.type === 'PreSubSupNode') return `<m:sPre><m:sPrePr></m:sPrePr><m:sub>${renderOMML(node.sub)}</m:sub><m:sup>${renderOMML(node.sup)}</m:sup><m:e>${renderOMML([node.base])}</m:e></m:sPre>`;
        // Добавьте этот блок внутрь функции renderOMML рядом с обработкой SupNode/SubSupNode
        if (node.type === 'UnderOverNode') {
            const val = node.base.value;

            // 1. Специфика для СУММЫ (∑) и ПРОИЗВЕДЕНИЯ (∏) в Word
            if (val === '∑' || val === '∏') {
                const subPart = node.sub ? `<m:sub>${renderOMML(node.sub)}</m:sub>` : '<m:sub/>';
                const supPart = node.sup ? `<m:sup>${renderOMML(node.sup)}</m:sup>` : '<m:sup/>';
                
                return `<m:nary>` +
                    `<m:naryPr>` +
                        `<m:chr m:val="${val}"/>` + // Сам знак ∑ или ∏
                        `<m:limLoc m:val="undOvr"/>` + // Инструкция Ворду: разместить индексы строго ПОД/НАД
                    `</m:naryPr>` +
                    subPart + 
                    supPart +
                    `<m:e><m:r><m:t>&#x200B;</m:t></m:r></m:e>` + // Убирает пустые скобки и рамки
                `</m:nary>`;
            }

            // 2. Специфика для ПРЕДЕЛОВ (lim, max, min, sup, inf) в Word
            if (node.sub && node.sup) {
                // Если у предела ввели два индекса одновременно (редко, но бывает), 
                // Ворд требует вложить limUpp внутрь limLow
                return `<m:limLow>` +
                    `<m:e>` +
                        `<m:limUpp>` +
                            `<m:e>${renderOMML([node.base])}</m:e>` +
                            `<m:lim>${renderOMML(node.sup)}</m:lim>` +
                        `</m:limUpp>` +
                    `</m:e>` +
                    `<m:lim>${renderOMML(node.sub)}</m:lim>` +
                `</m:limLow>`;
            }
            
            if (node.sub) {
                // Классический предел с нижней надписью: lim Low
                return `<m:limLow><m:e>${renderOMML([node.base])}</m:e><m:lim>${renderOMML(node.sub)}</m:lim></m:limLow>`;
            }
            
            if (node.sup) {
                // Предел с верхней надписью: lim Upp
                return `<m:limUpp><m:e>${renderOMML([node.base])}</m:e><m:lim>${renderOMML(node.sup)}</m:lim></m:limUpp>`;
            }
        }
        if (node.type === 'FencedNode') {
          return `<m:d><m:dPr><m:begChr w:val="${node.open}"/><m:endChr w:val="${node.close}"/><m:grow m:val="on"/></m:dPr><m:e>${renderOMML(node.body)}</m:e></m:d>`;
        }
        if (node.type === 'MatrixNode') {
            const table = `<m:m><m:mPr><m:baseJc m:val="center"/></m:mPr>${node.rows.map(r => `<m:mr><m:e>${renderOMML(r)}</m:e></m:mr>`).join('')}</m:m>`;
            if (node.env === 'p' || node.env === 'pmatrix') return `<m:d><m:dPr><m:begChr w:val="("/><m:endChr w:val=")"/></m:dPr><m:e>${table}</m:e></m:d>`;
            if (node.env === 'b' || node.env === 'bmatrix') return `<m:d><m:dPr><m:begChr w:val="["/><m:endChr w:val="]"/></m:dPr><m:e>${table}</m:e></m:d>`;
            if (node.env === 'cases') return `<m:d><m:dPr><m:begChr w:val="{"/><m:endChr w:val=""/></m:dPr><m:e>${table}</m:e></m:d>`;
            return table;
        }
        return '';
    }).join('');
}

export function texToMathML(tex) {
    try {

      const lexer = new TeXLexer(tex);
 console.log("Сырые токены из лексера:", lexer.tokenize()); 
    
    // Сбрасываем курсор лексера обратно в 0 после отладочного tokenize()
    lexer.cursor = 0; 
    lexer.currentLine = 1;
    lexer.currentColumn = 1;

        // 1. Создаем лексер и сборщик ошибок (в режиме мгновенного падения)
        //const lexer = new TeXLexer(tex);
        const errorCollector = new TeXErrorCollector('failFast');
            
        // 2. Инициализируем парсер и строим AST-дерево
        const parser = new TeXParser(lexer, errorCollector);
        const ast = parser.parse();

        // const tokens = tokenize(tex); const parser = new TeXParser(tokens); const ast = parser.parse();
        return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${renderMathML(ast)}</math>`;
    } catch (e) { return `<span style="color:red;">Ошибка MathML: ${e.message}</span>`; }
}

export function texToOMML(tex) {
    try {

        // 1. Создаем лексер и сборщик ошибок
        const lexer = new TeXLexer(tex);
        const errorCollector = new TeXErrorCollector('failFast');
        
        // 2. Инициализируем парсер и строим AST-дерево
        const parser = new TeXParser(lexer, errorCollector);
        const ast = parser.parse();        
        //const tokens = tokenize(tex); const parser = new TeXParser(tokens); const ast = parser.parse();
        return `<m:oMath>${renderOMML(ast)}</m:oMath>`;
    } catch (e) { return `<!-- Ошибка OMML: ${e.message} -->`; }
}
