#version 300 es

precision highp int;
precision highp float;

uniform ivec3 volume_dims;
uniform highp sampler2D colormap;
uniform highp sampler3D volume;
uniform vec2 value_range;
uniform float threshold;
uniform float saturation_threshold;

in vec3 vray_dir;
flat in vec3 transformed_eye;
out vec4 color;

float linear_to_srgb(float x) {
    if (x <= 0.0031308f) {
        return 12.92f * x;
    }
    return 1.055f * pow(x, 1.f / 2.4f) - 0.055f;
}

// Pseudo-random number gen from
// http://www.reedbeta.com/blog/quick-and-easy-gpu-random-numbers-in-d3d11/
// with some tweaks for the range of values
float wang_hash(int seed)
{
    seed = (seed ^ 61) ^ (seed >> 16);
    seed *= 9;
    seed = seed ^ (seed >> 4);
    seed *= 0x27d4eb2d;
    seed = seed ^ (seed >> 15);
    return float(seed % 2147483647) / float(2147483647);
}

vec2 intersect_box(vec3 orig, vec3 dir)
{
    const vec3 box_min = vec3(0);
    const vec3 box_max = vec3(1);
    vec3 inv_dir = 1.0 / dir;
    vec3 tmin_tmp = (box_min - orig) * inv_dir;
    vec3 tmax_tmp = (box_max - orig) * inv_dir;
    vec3 tmin = min(tmin_tmp, tmax_tmp);
    vec3 tmax = max(tmin_tmp, tmax_tmp);
    float t0 = max(tmin.x, max(tmin.y, tmin.z));
    float t1 = min(tmax.x, min(tmax.y, tmax.z));
    return vec2(t0, t1);
}

void main(void)
{
    vec3 ray_dir = normalize(vray_dir);
    vec2 t_hit = intersect_box(transformed_eye, ray_dir);
    if (t_hit.x > t_hit.y) {
        discard;
    }
    t_hit.x = max(t_hit.x, 0.0);
    vec3 dt_vec = 1.0 / (vec3(volume_dims) * abs(ray_dir));
    //const float dt_scale = 1.0;
    float dt = /*dt_scale */ min(dt_vec.x, min(dt_vec.y, dt_vec.z));
    float offset = wang_hash(int(gl_FragCoord.x + 1280.0 * gl_FragCoord.y));
    vec3 p = transformed_eye + (t_hit.x + offset * dt) * ray_dir;
    color = vec4(0);
    for (float t = t_hit.x; t < t_hit.y; t += dt) {
        float val = texture(volume, p).r;
        // TODO: Take value thresholds as parameters like webgl-neuron
        val = (val - value_range.x) / (value_range.y - value_range.x);
        if (val >= saturation_threshold) {
            val = 1.0;
        }
        if (val >= threshold) {
            val = clamp((val - threshold) / (1.0 - threshold), 0.0, 1.0);
            vec4 val_color = vec4(texture(colormap, vec2(val, 0.5)).rgb, val);
            // Opacity correction
            //val_color.a = 1.0 - pow(1.0 - val_color.a, dt_scale);
            color.rgb += (1.0 - color.a) * val_color.a * val_color.rgb;
            color.a += (1.0 - color.a) * val_color.a;
            if (color.a >= 0.95) {
                break;
            }
        }
        p += ray_dir * dt;
    }
    color.r = linear_to_srgb(color.r);
    color.g = linear_to_srgb(color.g);
    color.b = linear_to_srgb(color.b);
}
