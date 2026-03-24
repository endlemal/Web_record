#!/usr/bin/env node
/**
 * ============================================================================
 * 独立运行脚本：战绩查询
 * ============================================================================
 *
 * 使用方法:
 *   node fetchRecord.js <frameworkToken> [type] [page]
 *
 * 参数:
 *   - frameworkToken: 框架Token (必填)
 *   - type: 游戏模式，4=烽火地带, 5=全面战场 (可选，默认4)
 *   - page: 页码 (可选，默认1)
 *
 * 示例:
 *   node fetchRecord.js your_token_here 4 1
 *   node fetchRecord.js your_token_here 5 1
 *
 * ============================================================================
 */

// 导入必要的模块
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 输出文件路径
const OUTPUT_FILE = path.join(__dirname, 'output.txt')
const JSON_FILE = path.join(__dirname, 'message.json')

// 用于存储输出内容的数组
let outputLines = []

/**
 * 同时输出到控制台和文件
 */
function logToFile(message) {
  outputLines.push(message)
}

// ==================== 配置区域 (可直接修改) ====================

const CONFIG = {
  // API基础地址
  baseUrl: 'https://df-api.shallow.ink',
  // API密钥 (从config/config.yaml获取或直接使用)
  apiKey: 'sk-Y6FxEvALSU3RNfM57FkJUB7xOVcf3GLV',
  // clientID (用于获取用户token列表)
  clientID: '69ba9ac26cf046b2d75cebe3',
  // 请求超时时间(毫秒)
  timeout: 60000
}

// 状态映射表 (从原Record.js复制)
const ESCAPE_REASONS = {
  '1': '撤离成功',
  '2': '被玩家击杀',
  '3': '被人机击杀',
  '10': '撤离失败'
}

const MP_RESULTS = {
  '1': '胜利',
  '2': '失败',
  '3': '中途退出'
}

/**
 * 格式化时长 (从原Record.js复制)
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的时长
 */
function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '未知'
  if (seconds === 0) return '0秒'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) return `${hours}小时${minutes}分${secs}秒`
  if (minutes > 0) return `${minutes}分${secs}秒`
  return `${secs}秒`
}

// ==================== 核心代码 (无需修改) ====================

/**
 * 颜色输出工具
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  // 输出到控制台（带颜色）
  console.log(`${colors[color]}${message}${colors.reset}`)
  // 同时保存到文件（不带颜色）
  outputLines.push(message)
}

function logDivider(char = '=', length = 60) {
  const line = char.repeat(length)
  console.log(line)
  outputLines.push(line)
}

/**
 * 构建URL查询参数
 */
function buildQueryString(params) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      searchParams.append(key, value)
    }
  }
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

/**
 * 发送HTTP请求 (使用原生https模块，支持rejectUnauthorized: false)
 */
async function request(endpoint, params = {}, method = 'GET') {
  const url = new URL(`${CONFIG.baseUrl}${endpoint}${method === 'GET' ? buildQueryString(params) : ''}`)

  const headers = {
    'Authorization': `Bearer ${CONFIG.apiKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'DeltaForce-Record-Fetcher/1.0'
  }

  // POST请求需要body
  let postData = null
  if (method.toUpperCase() === 'POST') {
    postData = new URLSearchParams(params).toString()
    headers['Content-Length'] = Buffer.byteLength(postData)
  }

  log(`\n📡 发起请求: ${method.toUpperCase()} ${endpoint}`, 'cyan')
  log(`🔗 完整URL: ${url.toString()}`, 'dim')
  log(`📋 请求参数:`, 'dim')
  Object.entries(params).forEach(([key, value]) => {
    log(`   ${key}: ${value}`, 'dim')
  })

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers,
      // 允许自签名证书（与原插件一致）
      rejectUnauthorized: false,
      // 超时设置
      timeout: CONFIG.timeout
    }

    const req = https.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        // 记录响应状态
        log(`\n📥 响应状态: ${res.statusCode} ${res.statusMessage}`,
          res.statusCode >= 200 && res.statusCode < 300 ? 'green' : 'red')

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
          return
        }

        try {
          const jsonData = JSON.parse(data)

          // 检查业务错误
          if (jsonData.code !== 0 && jsonData.code !== undefined) {
            log(`⚠️  业务错误: ${jsonData.msg || jsonData.message || '未知错误'} (code: ${jsonData.code})`, 'yellow')
          }

          resolve(jsonData)
        } catch (e) {
          reject(new Error(`JSON解析失败: ${e.message}`))
        }
      })
    })

    req.on('error', (error) => {
      reject(new Error(`请求失败: ${error.message}`))
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`请求超时 (${CONFIG.timeout}ms)`))
    })

    if (postData) {
      req.write(postData)
    }

    req.end()
  })
}

/**
 * 获取战绩记录
 * 对应API: GET /df/person/record
 */
async function getRecord(frameworkToken, type = 4, page = 1) {
  logDivider()
  log('🎮 三角洲行动 - 战绩查询', 'bright')
  logDivider()

  log(`\n📊 查询参数:`, 'blue')
  log(`   游戏模式: ${type === 4 ? '烽火地带' : type === 5 ? '全面战场' : '未知'} (${type})`, 'blue')
  log(`   页码: ${page}`, 'blue')

  const result = await request('/df/person/record', {
    frameworkToken,
    type,
    page
  }, 'GET')

  return result
}

/**
 * 格式化输出战绩数据
 */
function formatRecordOutput(data) {
  logDivider('-')
  log('📋 响应数据:', 'bright')
  logDivider('-')

  if (!data) {
    log('❌ 无数据返回', 'red')
    return
  }

  // 显示原始响应
  log('\n📝 原始响应:', 'magenta')
  const jsonStr = JSON.stringify(data, null, 2)
  console.log(jsonStr)
  outputLines.push(jsonStr)

  // 保存原始响应到 JSON 文件
  fs.writeFileSync(JSON_FILE, jsonStr, 'utf8')
  log(`💾 原始响应已保存到: ${JSON_FILE}`, 'green')

  logDivider('-')

  // 解析业务数据
  if (data.code === 0 || data.success === true) {
    log('\n✅ 请求成功', 'green')

    const records = data.data
    if (records && Array.isArray(records)) {
      log(`\n📈 数据概览:`, 'cyan')
      log(`   战绩条数: ${records.length}`, 'cyan')

      // 显示每条战绩的简要信息
      if (records.length > 0) {
        log(`\n🏆 战绩列表:`, 'yellow')
        records.forEach((r, index) => {
          log(`\n   [${index + 1}] 对局信息:`, 'bright')
          
          // 时间
          if (r.dtEventTime) log(`       时间: ${r.dtEventTime}`, 'reset')
          
          // 地图名称 (烽火地带和全面战场的字段名不同)
          const mapId = r.MapId || r.MapID
          if (mapId) log(`       地图ID: ${mapId}`, 'reset')
          
          // 干员
          if (r.ArmedForceId) log(`       干员ID: ${r.ArmedForceId}`, 'reset')
          
          // 游戏时长
          const duration = r.DurationS || r.gametime
          if (duration) log(`       时长: ${formatDuration(Number(duration))}`, 'reset')
          
          // 根据模式显示不同信息
          if (r.EscapeFailReason !== undefined) {
            // 烽火地带 (type=4)
            const escapeStatus = ESCAPE_REASONS[String(r.EscapeFailReason)] || '撤离失败'
            log(`       撤离状态: ${escapeStatus}`, 'reset')
            log(`       带出价值: ${Number(r.FinalPrice || 0).toLocaleString()}`, 'reset')
            log(`       击杀: 玩家${r.KillCount || 0} / AI玩家${r.KillPlayerAICount || 0} / AI${r.KillAICount || 0}`, 'reset')
          } else if (r.MatchResult !== undefined) {
            // 全面战场 (type=5)
            const result = MP_RESULTS[String(r.MatchResult)] || '未知结果'
            log(`       比赛结果: ${result}`, 'reset')
            log(`       KDA: ${r.KillNum || 0}/${r.Death || 0}/${r.Assist || 0}`, 'reset')
            log(`       总得分: ${r.TotalScore ? r.TotalScore.toLocaleString() : 0}`, 'reset')
          }
        })
      } else {
        // 空数据提示（与原插件一致）
        log(`\n💡 提示: 该账号在此模式下没有战绩记录`, 'yellow')
        log(`   可能原因:`, 'dim')
        log(`   1. 该账号未玩过此模式`, 'dim')
        log(`   2. 战绩数据尚未同步到API`, 'dim')
        log(`   3. 尝试切换另一种模式查询:`, 'dim')
        log(`      node fetchRecord.js <token> 5 1  (全面战场)`, 'cyan')
        log(`      node fetchRecord.js <token> 4 1  (烽火地带)`, 'cyan')
      }
    } else {
      log(`\n⚠️  数据格式异常或为空`, 'yellow')
    }
  } else {
    log(`\n❌ 请求失败: ${data.msg || data.message || '未知错误'}`, 'red')
    if (data.code !== undefined) {
      log(`   错误码: ${data.code}`, 'red')
    }
  }

  logDivider('-')
}

/**
 * 显示使用帮助
 */
function showHelp() {
  logDivider()
  log('🎮 三角洲行动 - 战绩查询工具', 'bright')
  logDivider()
  log('\n📖 使用方法:', 'cyan')
  log('   node fetchRecord.js <frameworkToken> [type] [page]', 'reset')
  log('\n📋 参数说明:', 'cyan')
  log('   - frameworkToken: 框架Token (必填)', 'reset')
  log('   - type: 游戏模式 (可选)', 'reset')
  log('           4 = 烽火地带 (默认)', 'reset')
  log('           5 = 全面战场', 'reset')
  log('   - page: 页码 (可选，默认1)', 'reset')
  log('\n💡 示例:', 'cyan')
  log('   node fetchRecord.js your_token_here', 'reset')
  log('   node fetchRecord.js your_token_here 4 1', 'reset')
  log('   node fetchRecord.js your_token_here 5 1', 'reset')
  log('\n⚙️  配置:', 'cyan')
  log(`   API地址: ${CONFIG.baseUrl}`, 'dim')
  log(`   API密钥: ${CONFIG.apiKey.slice(0, 10)}...`, 'dim')
  log(`   ClientID: ${CONFIG.clientID}`, 'dim')
  logDivider()
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2)

  // 显示帮助
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp()
    process.exit(0)
  }

  const frameworkToken = args[0]
  const type = parseInt(args[1]) || 4
  const page = parseInt(args[2]) || 1

  // 验证参数
  if (!frameworkToken || frameworkToken === 'your_token_here') {
    log('❌ 错误: 请提供有效的 frameworkToken', 'red')
    log('   使用方法: node fetchRecord.js <frameworkToken> [type] [page]', 'dim')
    process.exit(1)
  }

  if (![4, 5].includes(type)) {
    log('⚠️  警告: type参数应为4(烽火地带)或5(全面战场)，使用默认值4', 'yellow')
  }

  try {
    const result = await getRecord(frameworkToken, type, page)
    formatRecordOutput(result)

    // 保存输出到文件
    fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf8')
    log(`\n💾 输出已保存到: ${OUTPUT_FILE}`, 'green')

    // 返回成功退出码
    process.exit(0)

  } catch (error) {
    log('\n❌ 请求异常:', 'red')
    log(`   ${error.message}`, 'red')

    if (error.message.includes('401')) {
      log('\n💡 提示: API Key可能无效或未配置', 'yellow')
      log('   请修改脚本中的 CONFIG.apiKey', 'yellow')
    }

    if (error.message.includes('fetch failed')) {
      log('\n💡 提示: 网络连接失败，请检查:', 'yellow')
      log('   1. 网络连接是否正常', 'yellow')
      log('   2. API地址是否正确', 'yellow')
      log(`   当前API地址: ${CONFIG.baseUrl}`, 'yellow')
    }

    // 保存错误输出到文件
    fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf8')
    log(`\n💾 输出已保存到: ${OUTPUT_FILE}`, 'green')

    // 返回错误退出码
    process.exit(1)
  }
}

// 运行主函数
main()
