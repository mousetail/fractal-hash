

    // 2. Lightweight Complex Number Class
    export class Complex {
        constructor(re, im = 0) {
            this.re = re;
            this.im = im;
        }
        static add(a, b) { return new Complex(a.re + b.re, a.im + b.im); }
        static sub(a, b) { return new Complex(a.re - b.re, a.im - b.im); }
        static mul(a, b) { return new Complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
        static scale(a, s) { return new Complex(a.re * s, a.im * s); }

        static pow(a, n) {
            if (n === 0) return new Complex(1, 0);
            let res = new Complex(1, 0);
            for (let i = 0; i < n; i++) res = Complex.mul(res, a);
            return res;
        }

        static sin(a) {
            // sin(x + iy) = sin(x)cosh(y) + i cos(x)sinh(y)
            return new Complex(
                Math.sin(a.re) * Math.cosh(a.im),
                Math.cos(a.re) * Math.sinh(a.im)
            );
        }

        static cos(a) {
            // cos(x + iy) = cos(x)cosh(y) - i sin(x)sinh(y)
            return new Complex(
                Math.cos(a.re) * Math.cosh(a.im),
                -Math.sin(a.re) * Math.sinh(a.im)
            );
        }

        toString() {
            const re = this.re.toFixed(2);
            const im = this.im.toFixed(2);
            return `(${re} ${im >= 0 ? '+' : '-'} ${Math.abs(im)}i)`;
        }
    }
