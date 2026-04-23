/**
 * DeepSeek AI integration for column identification.
 * Used as a fallback when the rule-based Excel parser cannot identify columns.
 */

const DEEPSEEK_API_KEY = process.env.deepseek_api_key;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

const QUESTION_SYSTEM_PROMPT = `你是一个数据分析师。给定 Excel 题库文件的列标题和样本数据，识别每列对应的字段。

可能的字段：
- content: 题目内容/试题描述
- correctAnswer: 正确答案（选择题的答案如 A, B, C, AB, ABCD）
- correctTF: 判断题答案（正确/错误/是/否）
- level: 难度级别/试题级别
- department: 所属部门
- role: 人员范围/岗位
- optionA ~ optionE: 各选项内容
- isMultiSelect: 是否可多选
- referenceAnswer: 参考答案/简答题答案
- _mergedOptions: 合并的选项列（如 "A.xx B.xx C.xx D.xx" 格式）
- _index: 序号列（应忽略）
- deptRole: 题目属性（部门--岗位格式）
- note: 备注/解析

规则：
1. 只返回你能确定的映射，不确定的不要包含
2. 返回 JSON 对象，key 是原始列名，value 是上面的字段名
3. 只返回 JSON，不要其他文字`;

const PARTICIPANT_SYSTEM_PROMPT = `你是一个数据分析师。给定 Excel 应考名单文件的列标题和样本数据，识别每列对应的字段。

可能的字段：
- name: 姓名
- employeeNo: 工号/员工编号
- department: 部门
- process: 报考工序（如 SAW, DB, WB, FA, IQC 等）
- level: 报考等级（如 Ⅰ级, Ⅱ级, Ⅲ级）
- verificationCode: 验证码/身份证后6位/密码

规则：
1. 只返回你能确定的映射，不确定的不要包含
2. 返回 JSON 对象，key 是原始列名，value 是上面的字段名
3. 只返回 JSON，不要其他文字
4. 试卷名称、备注等无关列不要映射`;

/**
 * Call DeepSeek to identify column mappings from Excel headers + sample data.
 * Returns a mapping of original header names → internal field names, or null on failure.
 */
/**
 * Call DeepSeek to identify column mappings from Excel headers + sample data.
 * @param mode - 'question' for question bank, 'participant' for candidate roster
 * Returns a mapping of original header names → internal field names, or null on failure.
 */
export async function identifyColumnsWithAI(
  headers: string[],
  sampleRows: Record<string, string>[],
  mode: 'question' | 'participant' = 'question'
): Promise<Record<string, string> | null> {
  if (!DEEPSEEK_API_KEY) return null;

  const systemPrompt = mode === 'participant'
    ? PARTICIPANT_SYSTEM_PROMPT
    : QUESTION_SYSTEM_PROMPT;

  const validFields = mode === 'participant'
    ? new Set(['name', 'employeeNo', 'department', 'process', 'level', 'verificationCode'])
    : new Set([
        'content', 'correctAnswer', 'correctTF', 'level', 'department', 'role',
        'optionA', 'optionB', 'optionC', 'optionD', 'optionE',
        'isMultiSelect', 'referenceAnswer', '_mergedOptions', '_index',
        'deptRole', 'note', 'gradingRubric',
      ]);

  const userPrompt = `列标题: ${JSON.stringify(headers)}\n样本数据 (前3行): ${JSON.stringify(sampleRows.slice(0, 3), null, 2)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error('DeepSeek API error:', response.status, response.statusText);
      return null;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';

    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('DeepSeek returned no JSON:', content);
      return null;
    }

    const mapping = JSON.parse(jsonMatch[0]) as Record<string, string>;

    // Validate: all values must be known field names
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(mapping)) {
      if (typeof value === 'string' && validFields.has(value)) {
        cleaned[key] = value;
      }
    }

    return Object.keys(cleaned).length > 0 ? cleaned : null;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('DeepSeek API timeout');
    } else {
      console.error('DeepSeek API error:', err);
    }
    return null;
  }
}
