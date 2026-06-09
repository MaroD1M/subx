# Diagnostic Overview Plan

## 目标
为字幕翻译任务提供一个轻量的“诊断总览”能力，帮助用户在不进入单个任务详情页的前提下，快速判断近期任务中最常见的风险类型、失败模式与人工核对压力。

## 第一阶段范围（当前建议实现）
- 仅提供后端聚合接口
- 暂不新增独立页面
- 前端后续可基于该接口接入首页卡片、历史页摘要或独立总览页

## 预期价值
- 快速回答“最近最常出什么问题”
- 快速识别“哪类字幕风险最多”
- 快速判断“是否有大量缺条/重试/回退原文”
- 为后续异常样本沉淀和规则优化提供方向

## 数据来源
- `tasks`：任务状态、创建时间、媒体库、输出模式
- `task_responses.response_meta`：分块风险标签、缺条、解析丢失、重试、单条补译、回退原文
- `task_review_entries`：需人工核对条数、核对原因

## 第一阶段接口建议
- 路径：`GET /api/tasks/diagnostics/overview`
- 支持参数：
  - `limit`：默认聚合最近 50 条任务
  - `status`：可选，仅聚合指定状态

## 第一阶段返回结构
- `summary`
  - `totalTasks`
  - `doneTasks`
  - `reviewTasks`
  - `errorTasks`
  - `cancelledTasks`
- `translation`
  - `totalChunks`
  - `missingIdChunks`
  - `chunksWithParseLoss`
  - `retriedChunks`
  - `singleRetriedChunks`
  - `fallbackChunks`
  - `totalRetryAttempts`
  - `totalSingleRetryAttempts`
  - `totalFallbackCount`
- `riskTags`
  - `{ tag, count }[]`
- `responseIssues`
  - `{ issue, count }[]`
- `reviewReasons`
  - `{ reason, count }[]`
- `sampledTasks`
  - 返回少量带代表性的任务摘要，便于后续前端点击进入详情

## 第二阶段可扩展方向
- 风险趋势（按天）
- 按媒体库 / 模型 / 目标语言分组
- 诊断总览页 UI
- 一键跳转到高风险任务列表
- 样本库与真实任务联动

## 前端接入建议
- 首页：展示最近任务风险摘要卡
- 历史页：加“诊断总览”折叠面板
- 独立页：后续需要时再展开成完整报表
