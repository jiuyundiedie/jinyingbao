export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return new Response('请使用 POST 请求', { status: 405 });
    }

    const authHeader = request.headers.get('Authorization');
    const expectedKey = env.API_KEY || 'my_secure_key_123';
    if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const { prompt, width = 1024, height = 1024, num_steps = 20 } = await request.json();

      if (!prompt) {
        return new Response('请提供 prompt 参数', { status: 400 });
      }

      const response = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt: prompt,
        width: width,
        height: height,
        num_steps: num_steps,
      });

      return new Response(response, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (error) {
      console.error('生成图片失败:', error);
      return new Response('生成图片失败: ' + error.message, { status: 500 });
    }
  }
};