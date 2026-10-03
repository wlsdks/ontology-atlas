import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const PARTS = [
  ['src/i18n/locales.ts', ['LOCALE_META', 'htmlLangOf']],
  ['src/i18n/answer-language.ts', ['answerLanguageName', 'answerLanguageSentence']],
  ['src/features/acp-session/model/use-acp-session.ts', [
    'ANSWER_LANGUAGE_SLOT', 'VAULT_HANDOFF_BASE', 'VAULT_MCP_SENTENCE',
    'VAULT_CONSTRUCTION_SENTENCE', 'vaultHandoffPrompt',
  ]],
  ['src/features/first-run-starter/model/build-from-code-prompt.ts', ['buildFromCodePrompt']],
];

export function constructionPrompts(checkout, target, locale = 'en') {
  const parts = PARTS.flatMap(([file, names]) => {
    const source = ts.createSourceFile(file, readFileSync(join(checkout, file), 'utf8'),
      ts.ScriptTarget.Latest, true);
    return names.map((name) => {
      const declaration = source.statements.find((statement) =>
        (ts.isFunctionDeclaration(statement) && statement.name?.text === name) ||
        (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(
          (item) => ts.isIdentifier(item.name) && item.name.text === name)));
      if (!declaration) throw new Error(`Construction prompt declaration missing: ${file}:${name}`);
      return declaration.getText(source);
    });
  });
  const { outputText } = ts.transpileModule(parts.join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const prompts = new Function('exports', `${outputText}\nreturn {
    handoff: vaultHandoffPrompt(true, ${JSON.stringify(locale)}),
    firstTurn: buildFromCodePrompt(${JSON.stringify(target)}, null),
  };`)({});
  if (!prompts.handoff.includes('connection_info') || !prompts.firstTurn.includes(target)) {
    throw new Error('Construction prompts no longer identify the MCP door and target');
  }
  return prompts;
}
