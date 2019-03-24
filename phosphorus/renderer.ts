/// <reference path="phosphorus.ts" />

namespace P.renderer {
  // Import aliases
  import RotationStyle = P.core.RotationStyle;

  /**
   * Creates the CSS filter for a Filter object.
   * The filter is generally an estimation of the actual effect.
   * Includes brightness and color. (does not include ghost)
   */
  function cssFilter(filters: P.core.Filters) {
    let filter = '';
    if (filters.brightness) {
      filter += 'brightness(' + (100 + filters.brightness) + '%) ';
    }
    if (filters.color) {
      filter += 'hue-rotate(' + (filters.color / 200 * 360) + 'deg) ';
    }
    return filter;
  }

  export interface Renderer {
    reset(scale: number): void;
    drawChild(child: P.core.Base): void;
    drawImage(image: HTMLImageElement | HTMLCanvasElement, x: number, y: number): void;
  }

  export class WebGLRenderer implements Renderer {
    public static vertexShader: string = `
    attribute vec2 a_scratchPosition;
    attribute vec2 a_texcoord;

    uniform vec2 u_resolution;

    varying vec2 v_texcoord;

    void main() {
      vec2 canvasPosition = a_scratchPosition + vec2(240, 180);
      vec2 zeroToOne = canvasPosition / u_resolution;
      vec2 zeroToTwo = zeroToOne * 2.0;
      vec2 clipSpace = zeroToTwo - 1.0;

      gl_Position = vec4(clipSpace, 0, 1);

      v_texcoord = a_texcoord;
    }
    `;

    public static fragmentShader: string = `
    precision mediump float;

    varying vec2 v_texcoord;

    uniform sampler2D u_texture;

    void main() {
      // gl_FragColor = vec4(0.5, 0.5, 0.5, 1);
      gl_FragColor = texture2D(u_texture, v_texcoord);
    }
    `;

    public gl: WebGLRenderingContext;

    private program: WebGLProgram;

    private a_scratchPosition: number;
    private a_texcoord: number;
    private u_resolution: WebGLUniformLocation;
    private u_texcoord: WebGLUniformLocation;

    constructor(public canvas: HTMLCanvasElement) {
      this.gl = canvas.getContext('webgl')!;
      this.gl.clearColor(0, 0, 0, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);

      this.program = this.compileProgram(WebGLRenderer.vertexShader, WebGLRenderer.fragmentShader)!;

      this.a_scratchPosition = this.gl.getAttribLocation(this.program, 'a_scratchPosition');
      this.a_texcoord = this.gl.getAttribLocation(this.program, 'a_texcoord');
      this.u_resolution = this.gl.getUniformLocation(this.program, 'u_resolution')!;
      this.u_texcoord = this.gl.getUniformLocation(this.program, 'u_texcoord')!;
    }

    compileShader(type: number, source: string): WebGLShader | null {
      const shader = this.gl.createShader(type)!;
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);

      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        console.error(this.gl.getShaderInfoLog(shader));
        this.gl.deleteShader(shader);
        return null;
      }

      return shader;
    }

    compileProgram(vs: string, fs: string): WebGLProgram | null {
      const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vs)!;
      const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fs)!;

      const program = this.gl.createProgram()!;
      this.gl.attachShader(program, vertexShader);
      this.gl.attachShader(program, fragmentShader);
      this.gl.linkProgram(program);

      if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
        console.error(this.gl.getProgramInfoLog(program));
        this.gl.deleteProgram(program);
        return null;
      }
    
      return program;
    }

    createTexture(costume: P.core.Costume): WebGLTexture {
      const texture = this.gl.createTexture()!;
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, costume.image);
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
      return texture;
    }

    reset(scale: number) {
      this.canvas.width = scale * 480;
      this.canvas.height = scale * 360;

      // Clear the canvas
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);

      // Init our shader
      this.gl.useProgram(this.program);
      this.gl.uniform2f(this.u_resolution, this.canvas.width, this.canvas.height);
    }

    drawChild(child: P.core.Base) {
      const rb = child.rotatedBounds();

      // Send position data into a buffer
      const positionBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
      const positions = [
        rb.right, rb.top,
        rb.left, rb.top,
        rb.right, rb.bottom,
        rb.right, rb.bottom,
        rb.left, rb.top,
        rb.left, rb.bottom,
      ];
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

      // Upload position data
      this.gl.enableVertexAttribArray(this.a_scratchPosition);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
      this.gl.vertexAttribPointer(this.a_scratchPosition, 2, this.gl.FLOAT, false, 0, 0);

      // Buffer for texcoords
      // const textureBuffer = this.gl.createBuffer();
      // this.gl.bindBuffer(this.gl.ARRAY_BUFFER, textureBuffer);
      // this.gl.enableVertexAttribArray(this.a_texcoord);
      // this.gl.vertexAttribPointer(this.a_texcoord, 2, this.gl.FLOAT, false, 0, 0);

      // And draw.
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    drawImage(image, x, y) {

    }
  }

  export abstract class Base2DRenderer implements Renderer {
    public ctx: CanvasRenderingContext2D;
    public canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
      const ctx = canvas.getContext('2d')!;
      this.ctx = ctx;
      this.canvas = canvas;
    }

    /**
     * Resizes and clears the renderer
     */
    reset(scale: number) {
      const effectiveScale = scale * P.config.scale;
      this.canvas.width = 480 * effectiveScale;
      this.canvas.height = 360 * effectiveScale;
      this.ctx.scale(effectiveScale, effectiveScale);
    }

    drawImage(image: CanvasImageSource, x: number, y: number) {
      this.ctx.drawImage(image, x, y);
    }

    abstract drawChild(child: P.core.Base): void;
  }

  /**
   * A renderer for drawing sprites (or stages)
   */
  export class SpriteRenderer2D extends Base2DRenderer {
    public noEffects: boolean = false;

    drawChild(c: P.core.Base) {
      const costume = c.costumes[c.currentCostumeIndex];
      if (!costume) {
        return;
      }

      this.ctx.save();

      const scale = c.stage.zoom * P.config.scale;
      this.ctx.translate(((c.scratchX + 240) * scale | 0) / scale, ((180 - c.scratchY) * scale | 0) / scale);

      // Direction transforms are only applied to Sprites because Stages cannot be rotated.
      if (P.core.isSprite(c)) {
        if (c.rotationStyle === RotationStyle.Normal) {
          this.ctx.rotate((c.direction - 90) * Math.PI / 180);
        } else if (c.rotationStyle === RotationStyle.LeftRight && c.direction < 0) {
          this.ctx.scale(-1, 1);
        }
        this.ctx.scale(c.scale, c.scale);
      }

      this.ctx.scale(costume.scale, costume.scale);
      this.ctx.translate(-costume.rotationCenterX, -costume.rotationCenterY);

      if (!this.noEffects) {
        this.ctx.globalAlpha = Math.max(0, Math.min(1, 1 - c.filters.ghost / 100));

        const filter = cssFilter(c.filters);
        // Only apply a filter if necessary, otherwise Firefox performance nosedives.
        if (filter !== '') {
          this.ctx.filter = filter;
        }
      }

      this.ctx.drawImage(costume.image, 0, 0);
      this.ctx.restore();
    }
  }

  /**
   * A renderer specifically for the backdrop of a Stage.
   */
  export class StageRenderer extends SpriteRenderer2D {
    constructor(canvas: HTMLCanvasElement, private stage: P.core.Stage) {
      super(canvas);
      // We handle effects in other ways, so forcibly disable SpriteRenderer's filters
      this.noEffects = true;
    }

    drawStage() {
      this.drawChild(this.stage);
      this.updateFilters();
    }

    updateFilters() {
      const filter = cssFilter(this.stage.filters);
      // Only reapply a CSS filter if it has changed for performance.
      // Might not be necessary here.
      if (this.canvas.style.filter !== filter) {
        this.canvas.style.filter = filter;
      }

      // cssFilter does not include ghost
      this.canvas.style.opacity = '' + Math.max(0, Math.min(1, 1 - this.stage.filters.ghost / 100));
    }
  }
}
