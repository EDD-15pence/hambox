/**
 * Prompt template mock data for Prompt Tool
 *
 * Requirements:
 * - Follow the schema defined in docs/prompt-tool-design.md
 * - Export an array of prompt templates
 * - Each template must include:
 *   id, title, description, category, template, variables
 * - This file contains DATA ONLY, no logic
 */

// 本文件遵循 docs/prompt-tool-design.md 和 docs/prompt-tool-folder-structure.md
// Mock prompt template data for MVP
module.exports = [
  {
    id: "plan_001",
    title: "详细工作计划",
    description: "生成清晰可执行的工作计划",
    category: "规划",
    template: "你是一名{{role}}。根据以下背景：{{background}}，请制定一个{{timeRange}}的工作计划。输出请遵循：{{outputFormat}}。",
    variables: [
      { key: "role", label: "你的角色", placeholder: "填写角色描述", defaultValue: "专业顾问", required: true },
      { key: "background", label: "背景信息", placeholder: "填写背景信息", required: true },
      { key: "timeRange", label: "时间范围", placeholder: "填写时间范围", required: false },
      { key: "outputFormat", label: "输出格式", placeholder: "填写输出格式", defaultValue: "编号列表", required: false }
    ]
  },
  // more templates can be added here
  {
    id: "plan_002",
    title: "简要工作计划",
    description: "生成简洁明了的工作计划",
    category: "规划",
    template: "你是一名{{role}}。根据以下背景：{{background}}，请制定一个{{timeRange}}的工作计划。输出请遵循：{{outputFormat}}。",
    variables: [
      { key: "role", label: "你的角色", placeholder: "填写角色描述", defaultValue: "专业顾问", required: true },
      { key: "background", label: "背景信息", placeholder: "填写背景信息", required: true },
      { key: "timeRange", label: "时间范围", placeholder: "填写时间范围", required: false },
      { key: "outputFormat", label: "输出格式", placeholder: "填写输出格式", defaultValue: "编号列表", required: false }
    ]
  },
  {
    id: "plan_003",
    title: "中期工作计划",
    description: "生成中期的工作计划",
    category: "规划",
    template: "你是一名{{role}}。根据以下背景：{{background}}，请制定一个{{timeRange}}的工作计划。输出请遵循：{{outputFormat}}。",
    variables: [
      { key: "role", label: "你的角色", placeholder: "填写角色描述", defaultValue: "专业顾问", required: true },
      { key: "background", label: "背景信息", placeholder: "填写背景信息", required: true },
      { key: "timeRange", label: "时间范围", placeholder: "填写时间范围", required: false },
      { key: "outputFormat", label: "输出格式", placeholder: "填写输出格式", defaultValue: "编号列表", required: false }
    ]
  },
  {
    id: "plan_004",
    title: "短期工作计划",
    description: "生成短期的工作计划",
    category: "规划",
    template: "你是一名{{role}}。根据以下背景：{{background}}，请制定一个{{timeRange}}的工作计划。输出请遵循：{{outputFormat}}。",
    variables: [
      { key: "role", label: "你的角色", placeholder: "填写角色描述", defaultValue: "专业顾问", required: true },
      { key: "background", label: "背景信息", placeholder: "填写背景信息", required: true },
      { key: "timeRange", label: "时间范围", placeholder: "填写时间范围", required: false },
      { key: "outputFormat", label: "输出格式", placeholder: "填写输出格式", defaultValue: "编号列表", required: false }
    ]
  }

];
