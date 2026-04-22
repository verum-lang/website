---
sidebar_position: 7
title: Train a small neural net
description: MNIST classifier with math.nn, autodiff, and tensor literals.
---

# Train a small neural net

**Time: 45 minutes. Prerequisites: [Hello, World](/docs/getting-started/hello-world),
[math stdlib overview](/docs/stdlib/math).**

We'll build an MNIST classifier — a two-layer MLP with softmax — and
train it with SGD. Verum's `math.nn` gives us the layers, `math.autodiff`
computes gradients, and `math.tensor` handles the data.

## 1. Scaffold

```bash
$ verum new mnist
$ cd mnist
```

`verum.toml`:

```toml
[cog]
name    = "mnist"
version = "0.1.0"
edition = "2026"
profile = "application"

[dependencies]
# All we need ships with the stdlib.

[build]
optimize = "aggressive"
target-cpu = "native"        # enable AVX2 / NEON vectorisation for tensors

[runtime]
kind = "full"
```

## 2. Load the dataset

`src/data.vr`:

```verum
use core.io.*;
use core.math.tensor.*;

pub type Dataset is {
    images: Tensor<Float32>,      // [N, 784]
    labels: Tensor<Int32>,         // [N]
};

/// Load IDX-format MNIST data (classic Yann LeCun format).
fn load_images(path: &Path) -> IoResult<Tensor<Float32>> {
    let bytes = fs::read(path)?;
    // Magic + header
    let magic = u32_from_be(&bytes[0..4]);
    assert_eq(magic, 0x00000803);
    let n = u32_from_be(&bytes[4..8]) as Int;
    let rows = u32_from_be(&bytes[8..12]) as Int;
    let cols = u32_from_be(&bytes[12..16]) as Int;

    let total = n * rows * cols;
    let mut data = List::<Float32>::with_capacity(total);
    for i in 0..total {
        data.push(bytes[16 + i] as Float32 / 255.0);
    }
    // Flatten to [n, 784]
    Result.Ok(Tensor::from_slice::<Float32, shape![n, 784]>(&data))
}

fn load_labels(path: &Path) -> IoResult<Tensor<Int32>> {
    let bytes = fs::read(path)?;
    assert_eq(u32_from_be(&bytes[0..4]), 0x00000801);
    let n = u32_from_be(&bytes[4..8]) as Int;
    let data: List<Int32> = bytes[8..8 + n].iter().map(|b| *b as Int32).collect();
    Result.Ok(Tensor::from_slice::<Int32, shape![n]>(&data))
}

fn u32_from_be(bytes: &[Byte]) -> UInt32 {
    (bytes[0] as UInt32) << 24
    | (bytes[1] as UInt32) << 16
    | (bytes[2] as UInt32) << 8
    | (bytes[3] as UInt32)
}
```

## 3. Define the model

`src/model.vr`:

```verum
use core.math.nn.*;
use core.math.tensor.*;
use core.math.random.*;

pub type MNISTNet is {
    fc1: Linear,
    fc2: Linear,
};

implement MNISTNet {
    fn new(rng: &mut Rng) -> MNISTNet {
        MNISTNet {
            fc1: Linear::new_xavier(784, 128, rng),
            fc2: Linear::new_xavier(128, 10,  rng),
        }
    }
}

implement Module for MNISTNet {
    fn forward(&self, x: &Tensor<Float32>) -> Tensor<Float32> {
        // x: [batch, 784]  ->  [batch, 10]
        let h = self.fc1.forward(x);
        let h = relu(&h);
        self.fc2.forward(&h)
    }

    fn parameters(&self) -> List<&Parameter<Tensor<Float32>>> {
        let mut ps = list![];
        ps.extend(self.fc1.parameters());
        ps.extend(self.fc2.parameters());
        ps
    }
}
```

## 4. Training step

`src/train.vr`:

```verum
use core.math.nn.*;
use core.math.tensor.*;
use core.math.autodiff.*;
use .self.model::MNISTNet;

fn train_step(
    model: &mut MNISTNet,
    optimiser: &mut AdamW,
    images: &Tensor<Float32>,        // [batch, 784]
    labels: &Tensor<Int32>,          // [batch]
) -> Float {
    // Forward + loss (cross-entropy)
    let (loss, grads) = value_and_grad(|params| {
        let logits = model.forward(images);
        cross_entropy(&logits, labels)
    }, model.parameters());

    // Clip, then optimiser step
    clip_grad_norm(&grads, 5.0);
    optimiser.step(&grads);

    loss.to_scalar()
}

fn accuracy(model: &MNISTNet, images: &Tensor<Float32>, labels: &Tensor<Int32>) -> Float {
    let logits = model.forward(images);         // [N, 10]
    let preds = logits.argmax(axis = 1);         // [N]
    let correct = preds.eq(labels).sum().to_scalar() as Int;
    correct as Float / (labels.shape().dim(0) as Float)
}
```

## 5. Main loop

`src/main.vr`:

```verum
use core.io.*;
use core.math.random::{Rng, PCG};
use core.math.nn::AdamW;
use core.math.tensor::*;
use .self.data::*;
use .self.model::MNISTNet;
use .self.train::*;

const BATCH_SIZE: Int = 64;
const EPOCHS: Int = 10;
const LR: Float = 0.001;
const DATA_DIR: &str = "./data";

fn main() {
    print(&"loading data…");
    let train_images = load_images(&Path.from(&f"{DATA_DIR}/train-images-idx3-ubyte")).unwrap();
    let train_labels = load_labels(&Path.from(&f"{DATA_DIR}/train-labels-idx1-ubyte")).unwrap();
    let test_images = load_images(&Path.from(&f"{DATA_DIR}/t10k-images-idx3-ubyte")).unwrap();
    let test_labels = load_labels(&Path.from(&f"{DATA_DIR}/t10k-labels-idx1-ubyte")).unwrap();

    print(&f"train: {train_images.shape().dim(0)} examples");
    print(&f"test:  {test_images.shape().dim(0)} examples");

    let mut rng = PCG::seed(42);
    let mut model = MNISTNet.new(&mut rng);
    let mut optimiser = AdamW.new(model.parameters(), LR, (0.9, 0.999), 0.0001);

    let num_batches = train_images.shape().dim(0) / BATCH_SIZE;

    for epoch in 1..=EPOCHS {
        // Shuffle indices
        let mut indices: List<Int> = (0..train_images.shape().dim(0)).collect();
        rng.shuffle_vec(&mut indices);

        let mut total_loss = 0.0;
        let start = Instant.now();

        for batch_id in 0..num_batches {
            let start_idx = batch_id * BATCH_SIZE;
            let batch_indices = &indices[start_idx..start_idx + BATCH_SIZE];

            let batch_x = train_images.index_select(batch_indices);
            let batch_y = train_labels.index_select(batch_indices);

            total_loss += train_step(&mut model, &mut optimiser, &batch_x, &batch_y);
        }

        let avg_loss = total_loss / num_batches as Float;
        let test_acc = accuracy(&model, &test_images, &test_labels);
        print(&f"epoch {epoch}/{EPOCHS}  loss={avg_loss:.4}  test_acc={test_acc:.2%}  ({start.elapsed().as_secs()}s)");
    }

    print(&f"final test accuracy: {accuracy(&model, &test_images, &test_labels):.2%}");
}
```

## 6. Tests

```verum
@cfg(test)
module tests {
    use .super.model::MNISTNet;
    use core.math.tensor::*;
    use core.math.random::PCG;

    @test
    fn forward_shape() {
        let mut rng = PCG::seed(0);
        let m = MNISTNet.new(&mut rng);
        let x = Tensor::zeros::<Float32, shape![16, 784]>();
        let out = m.forward(&x);
        assert_eq(out.shape().dim(0), 16);
        assert_eq(out.shape().dim(1), 10);
    }

    @test
    fn parameters_have_gradients() {
        let mut rng = PCG::seed(0);
        let m = MNISTNet.new(&mut rng);
        let x = Tensor::randn::<Float32, shape![4, 784]>(&mut rng);
        let y = Tensor::from_slice::<Int32, shape![4]>(&[0, 1, 2, 3]);

        let (_loss, grads) = value_and_grad(
            |params| cross_entropy(&m.forward(&x), &y),
            m.parameters(),
        );

        for g in &grads { assert(!g.has_nan()); }
    }
}
```

## 7. Run

Download MNIST first (classic):

```bash
$ mkdir -p data && cd data
$ for f in train-images-idx3-ubyte train-labels-idx1-ubyte \
           t10k-images-idx3-ubyte t10k-labels-idx1-ubyte ; do
    curl -O http://yann.lecun.com/exdb/mnist/$f.gz
    gunzip $f.gz
  done
```

Train:

```bash
$ verum run --release
loading data…
train: 60000 examples
test:  10000 examples
epoch 1/10  loss=0.3218  test_acc=94.02%  (3s)
epoch 2/10  loss=0.1426  test_acc=96.40%  (3s)
...
epoch 10/10 loss=0.0294  test_acc=97.82%  (3s)
final test accuracy: 97.82%
```

(Timings on an M3 Max with AVX2 equivalent NEON path.)

## How the autodiff plumbing works

```verum
let (loss, grads) = value_and_grad(|params| {
    cross_entropy(&model.forward(images), labels)
}, model.parameters());
```

1. The closure is called once to compute the scalar loss.
2. Verum's autodiff builds a **reverse-mode** computational graph
   along the way (every tensor op records its backward).
3. `value_and_grad` kicks the backward pass from the loss scalar
   down through every parameter.
4. `grads` is a list of tensors, one per parameter, matching shapes.

`AdamW::step(&grads)` then applies AdamW updates in place.

## Going bigger

- **Conv nets**: replace `Linear` with `Conv2d`. MNIST with a
  4-layer convnet reaches 99.3% in 5 epochs.
- **Training on GPU**: add `@device(gpu)` to the forward pass; the
  compiler routes tensor ops through `math.gpu`. See
  [simd::gpu](/docs/stdlib/simd#gpu-simdgpu).
- **Mixed precision**: use `Float16` for activations; AdamW carries
  `Float32` master weights.
- **Save / load**: serialise `Parameter` tensors via
  `@derive(Serialize)`.

## What you learned

- **Tensor literals and static shapes** via `shape![N, 784]`.
- **Module + Parameter protocols** from `math.nn`.
- **`value_and_grad` and `clip_grad_norm`** for the training loop.
- **AdamW optimiser** with weight decay.
- **Efficient batched forward/backward** via auto-vectorisation at
  `target-cpu = "native"`.

## See also

- **[math → autodiff](/docs/stdlib/math#layer-6--automatic-differentiation)**
- **[math → nn](/docs/stdlib/math#layer-7--neural-networks)**
- **[math → tensor](/docs/stdlib/math#layer-4--tensor-system)**
- **[simd](/docs/stdlib/simd)** — the SIMD paths powering tensor ops.
