import { Context, Schema, Logger } from 'koishi'

export const usage = `
## koishi-plugin-api-handler v1.0.6

1. 配置API地址。

2. 设置消息前缀，例如：tx。

3. 当用户发送的消息以该前缀开头（如tx1234或Tx1234）时，系统将通过POST方式向API发送请求，包括参数：token、message、channelId

4. 服务器需返回一个字符串，该字符串将作为机器人的回复消息。

注意：只有群内@机器人的消息才会处理。

`

export const name = 'koishi-plugin-api-handler'

export const logger = new Logger('koishi-plugin-api-handler')

export interface Config {
  api: string,
  token: string,
  prefix_1: string,
  prefix_2: string,
  prefix_3?: string,
  prefix_4?: string,
}

export const Config: Schema<Config> = Schema.object({
  api: Schema.string().required(true).description('API地址'),
  token: Schema.string().required(true).description('API接收的token，以POST传递,参数名为token'),
  prefix_1: Schema.string().required(true).description('消息开头匹配字符串，不区分大小写，完全包含则将用户消息发送到API，由API返回回复内容字符串'),
  prefix_2: Schema.string().description('匹配消息前缀2'),
  prefix_3: Schema.string().description('匹配消息前缀3'),
  prefix_4: Schema.string().description('匹配消息前缀4'),
})

export function startsWithPrefix(str: string, prefix: string) {
  // 首先去掉字符串前后的空格
  str = str.trim();

  // 构建正则表达式，不区分大小写
  const regex = new RegExp('^' + prefix, 'i');

  // 使用正则表达式判断是否以指定前缀开头
  return regex.test(str);
}

export function handlePrefixes(sessionContent: string, config: Config) {
  for (let i = 1; i <= 4; i++) {  // 假设有四个前缀
    let prefixKey = `prefix_${i}`;
    if (config[prefixKey]) {
      if (startsWithPrefix(sessionContent, config[prefixKey])) {
        // 这里可以根据前缀执行不同的逻辑
        return `匹配前缀${i}`;
      }
    }
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.middleware(async (session, next) => {

    const content = session.content;
    const botId = session.selfId;

    logger.info('原始消息:' + content);
    logger.info('机器人QQ:' + botId);

    // 使用正则表达式确保准确匹配特定的提到格式
    const mentionRegex = new RegExp(`<at id="${botId}"/>`);
    const isMentioned = content && mentionRegex.test(content);
    if (!isMentioned) {
      return next()
    }

    const cleanContent = content.replace(/<at id="\d+"\/>/g, '').trim();
    logger.info('文本消息:' + cleanContent);
    logger.info('群组:' + session.channelId)

    let match_prefix = handlePrefixes(cleanContent, config)
    if (match_prefix) {
      logger.info(match_prefix)
      const res = await ctx.http.post(config.api, {
        token: config.token,
        message: cleanContent,
        channelId: session.channelId,
      })
        .catch((err) => {
          return { error: err.message }
        })
      if (res !== undefined) {
        return res;
      }

      return 'Error';
    }
    return next()
  }, true)
}
