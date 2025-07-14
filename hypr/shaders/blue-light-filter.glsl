#version 460

layout(location = 0) out vec4 fragColor;

uniform sampler2D screenTexture;
uniform float intensity; // 0.0 - 1.0, где 0 - нет эффекта, 1 - максимальный эффект
uniform float temperature; // 6500k - 3000k (например)

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(1920.0, 1080.0); // Размер экрана для нормализации координат
    vec4 color = texture(screenTexture, uv);

    // Применение фильтра синего света с температурой
    float r = color.r * (1.0 - intensity * 0.5);
    float g = color.g * (1.0 - intensity * 0.3);
    float b = color.b * (1.0 + intensity * 0.5);

    // Корректировка цветовой температуры
    float factor = (temperature - 6500.0) / 3500.0;
    r += factor * 0.1;
    g -= factor * 0.05;
    b -= factor * 0.1;

    fragColor = vec4(r, g, b, 1.0);
}

