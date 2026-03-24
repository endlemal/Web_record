# 战绩API请求 Pipeline 流程图

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RecordApiClient 类                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐     │
│   │   配置层     │    │   请求层     │    │       业务API层          │     │
│   │  (Config)    │───▶│  (request)   │◀───│  (getRecord等)           │     │
│   └──────────────┘    └──────┬───────┘    └──────────────────────────┘     │
│                              │                                              │
│                              ▼                                              │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │                      HTTP请求Pipeline                            │     │
│   │  1. 验证API Key → 2. 构建URL → 3. 设置Headers → 4. 处理参数    │     │
│   │  5. 发送请求 → 6. 处理响应 → 7. 错误重试 → 8. 返回结果         │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 详细Pipeline流程

### 1. 基础请求方法 `request()` 流程

```
开始
 │
 ▼
┌─────────────────────┐
│  STEP 1: 验证API Key │
│  - 检查是否配置      │
│  - 检查是否为默认值  │
└──────────┬──────────┘
 │         │ 未通过
 │ 通过    ▼
 │    ┌─────────────────┐
 │    │ 返回错误/false  │
 │    └─────────────────┘
 ▼
┌─────────────────────┐
│  STEP 2: 构建请求头  │
│  Authorization:     │
│  Bearer {apiKey}    │
└──────────┬──────────┘
 │
 ▼
┌─────────────────────┐
│  STEP 3: 获取基础URL │
│  ApiUrlManager.get  │
│  BaseUrl()          │
└──────────┬──────────┘
 │
 ▼
┌─────────────────────┐
│  STEP 4: 处理参数    │
│  GET: 转查询字符串   │
│  POST: 转表单格式    │
└──────────┬──────────┘
 │
 ▼
┌─────────────────────┐
│  STEP 5: 发起请求    │
│  fetch(fullUrl,     │
│  options)           │
└──────────┬──────────┘
 │
 ▼
┌─────────────────────┐
│  STEP 6: 检查响应    │
│  response.ok?       │
└──────────┬──────────┘
 │         │
 │是       │否 (HTTP错误)
 ▼         ▼
┌──────────────┐    ┌─────────────────────────────┐
│ 解析JSON响应  │    │  STEP 7: 错误处理与重试     │
└──────┬───────┘    │  - 状态码 >= 500?           │
 │                 │  - auto模式?                │
 ▼                 │  - 标记失败并切换URL        │
┌────────────────┐  │  - 重试请求                 │
│ STEP 8: 业务   │  └─────────────┬───────────────┘
│ 错误检查       │                │
│ code !== 0?    │◀───────────────┘
└───────┬────────┘
 │
 ▼
返回结果
```

---

### 2. 战绩获取调用链

以 `getRecord()` 为例：

```
用户调用
    │
    ▼
┌─────────────────────────────────────────┐
│ getRecord(frameworkToken, type, page)   │
│ 获取战绩记录                             │
│ 参数:                                   │
│   - frameworkToken: 用户token           │
│   - type: 4(烽火地带) / 5(全面战场)     │
│   - page: 页码                          │
└─────────────────┬───────────────────────┘
 │                │
 │ 构建参数对象    │
 │ { frameworkToken, type, page }
 │                │
 ▼                │
┌─────────────────────────────────────────┐
│ request('/df/person/record', params,    │
│ 'GET')                                  │
│                                         │
│ 端点: /df/person/record                 │
│ 方法: GET                               │
└─────────────────┬───────────────────────┘
 │
 ▼
[进入上述Pipeline流程]
 │
 ▼
返回战绩数据
```

---

### 3. 自动重试机制流程

```
请求失败
    │
    ▼
┌─────────────────────────┐
│ 检查状态码 >= 500?      │
└───────────┬─────────────┘
 │         │
 │是       │否
 ▼         ▼
┌──────────────┐    ┌──────────────┐
│ auto模式?    │    │ 直接返回错误  │
└──────┬───────┘    └──────────────┘
 │    │
 │是  │否
 ▼    ▼
┌─────────────────┐  ┌──────────────┐
│ markUrlFailed() │  │ 直接返回错误  │
│ 标记当前URL失败  │  └──────────────┘
└────────┬────────┘
 │
 ▼
┌─────────────────────────┐
│ getBaseUrl() 获取新URL  │
└───────────┬─────────────┘
 │
 ▼
┌─────────────────────────┐
│ 新URL ≠ 旧URL?          │
└───────────┬─────────────┘
 │         │
 │是       │否 (无可用URL)
 ▼         ▼
┌─────────────────┐    ┌──────────────┐
│ 使用新URL重试    │    │ 返回错误      │
│ 请求            │    └──────────────┘
└────────┬────────┘
 │
 ▼
成功? ──是──▶ 返回结果
 │
 否
 ▼
返回错误
```

---

## 关键代码片段解析

### 参数处理 (GET请求)

```javascript
// 特殊处理数组参数，特别是id参数
const processedParams = new URLSearchParams()
for (const [key, value] of Object.entries(params)) {
  if (Array.isArray(value)) {
    // 对于数组参数，将其转换为JSON字符串格式：[id1,id2,id3]
    processedParams.append(key, JSON.stringify(value))
  } else if (value !== null && value !== undefined) {
    processedParams.append(key, value)
  }
}
const queryString = processedParams.toString()
fullUrl += `?${queryString}`
```

### 业务错误判断

```javascript
// 判断是否为轮询接口：登录状态轮询等正常的中间状态不应该被当作错误
const isLoginStatusPolling = fullUrl.includes('/login/') && fullUrl.includes('/status')
const isOAuthStatusPolling = fullUrl.includes('/oauth/status') || fullUrl.includes('/oauth/platform-status')
const isNormalPollingStatus = isLoginStatusPolling || isOAuthStatusPolling

// 只有在非轮询接口或明确的错误状态时才打印警告
if (responseBody.code !== 0 && responseBody.success !== true && !isNormalPollingStatus) {
  logger.warn(`[DELTA FORCE PLUGIN] API 返回业务错误...`)
}
```

---

## 文件结构

```
experimental/record-pipeline/
├── RecordApiClient.js    # 主要的API客户端类
├── PIPELINE.md           # 本文件 - Pipeline流程文档
└── README.md             # 使用说明
```

---

## 与原始Code.js的关系

```
Code.js (原始文件)
    │
    ├── 基础请求方法 ─────────┐
    │   ├── request()         │
    │   └── requestJson()     │
    │                         │
    ├── 战绩相关方法 ─────────┤
    │   ├── getRecord()       │ 复制到
    │   ├── getPersonalData() │  RecordApiClient.js
    │   ├── getPersonalInfo() │
    │   ├── getMapStats()     │
    │   ├── getMoney()        │
    │   ├── getFlows()        │
    │   ├── getDailyRecord()  │
    │   ├── getWeeklyRecord() │
    │   └── 订阅相关方法      │
    │                         │
    └── 其他业务方法          │ (保持独立)
        ├── 登录相关          │
        ├── 房间相关          │
        ├── 改枪方案          │
        ├── 价格相关          │
        └── ...               │
                              ▼
                    RecordApiClient.js
                    (本实验性文件)
```

---

## 使用方式

### 方式1: 独立使用

```javascript
import RecordApiClient from './RecordApiClient.js'

const config = {
  api_key: 'your_api_key_here'
}

const client = new RecordApiClient(config)

// 获取战绩
const record = await client.getRecord('user_token', 4, 1)
console.log(record)
```

### 方式2: 与原有系统集成

```javascript
import RecordApiClient from './experimental/record-pipeline/RecordApiClient.js'
import Config from './components/Config.js'

// 在原有代码中使用
const config = Config.getConfig()?.delta_force || {}
const recordClient = new RecordApiClient(config, this.e)

// 替代原有的调用
// 原: await this.Code.getRecord(token, type, page)
// 新:
const result = await recordClient.getRecord(token, type, page)
```

---

## 总结

这个Pipeline设计的核心思想：

1. **分层清晰**: 配置层 → 请求层 → 业务层
2. **错误处理完善**: HTTP错误、业务错误、网络错误都有处理
3. **自动容错**: 支持多API地址自动切换
4. **参数处理灵活**: 支持数组、空值等多种参数类型
5. **可扩展性强**: 新增API只需添加对应方法即可
