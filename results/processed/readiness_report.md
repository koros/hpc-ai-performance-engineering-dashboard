# Experiment Readiness Report

Generated from repository configuration, validation checks, workload registry, and Slurm smoke presets.

## Summary

- Source matrix configs discovered: 200
- Supplemental platform probes discovered: 25
- Cross-platform telemetry anchors discovered: 5
- Total E-number configs discovered: 230
- Validation issues: 0
- Research-readiness blockers: 0
- Deferred scope rows: 15
- Registered workloads: distilbert, environment_validation, gpt2_small, synthetic, tinyllama
- Slurm smoke presets: 6
- Core environment checks completed: 5/5
- Baseline definitions with at least 3 trials: 10/10
- Pilot evidence gate: READY

## Validation

Validation passed for configs and current raw result records.

## Research Readiness

All non-deferred matrix configs have a semantically valid execution path.

## Deferred Scope

These rows remain in the planning matrix but are excluded from deployment batches until the stated backend or measurement contract is supplied.

| Experiment | Reason |
| --- | --- |
| `E007` | Implementation is complete locally; final activation requires a successful E007 run on the target H100 node. |
| `E086` | Requires a selected and validated H100 FP8 training backend with recorded model/runtime support. |
| `E089` | Requires a selected and validated FP8 inference backend and model artifact. |
| `E093` | Requires a selected and validated H100 FP8 training backend with recorded model/runtime support. |
| `E096` | Requires a selected and validated FP8 inference backend and model artifact. |
| `E131` | Requires a pinned TensorRT-LLM engine artifact and engine-specific runtime adapter. |
| `E151` | Requires a selected and validated FP8 inference backend and model artifact. |
| `E152` | Requires a named quantization method, calibration protocol, and immutable quantized artifact. |
| `E154` | vLLM is a causal-generation engine and does not provide a validated DistilBERT classification adapter. |
| `E155` | Requires a classification-compatible TensorRT-LLM contract and a built engine artifact. |
| `E175` | Requires a selected and validated FP8 inference backend and model artifact. |
| `E176` | Requires a named quantization method, calibration protocol, and immutable quantized artifact. |
| `E179` | Requires a site-built TensorRT-LLM engine and validated engine adapter contract. |
| `E199` | Requires a selected and validated FP8 inference backend and model artifact. |
| `E200` | Requires a named quantization method, calibration protocol, and immutable quantized artifact. |

## Cluster Evidence Gate

- Core environment validations: passed
- DeepSpeed environment validation: passed
- Must Have baseline repetitions: passed

The pilot gate remains blocked until every core environment check has one valid completion and every Must Have baseline definition has at least 3 valid trials. E005 is an additional gate before DeepSpeed strategy batches.

## Workload Coverage

| Workload | Matrix configs | Registry status |
| --- | ---: | --- |
| `distilbert` | 85 | PyTorch training/inference implemented |
| `environment_validation` | 9 | Implemented; cluster verification required |
| `gpt2_small` | 97 | PyTorch training/inference and vLLM routing implemented |
| `tinyllama` | 39 | PyTorch training/inference and vLLM routing implemented |

## Matrix Breakdown

### By Priority

| Priority | Count |
| --- | ---: |
| Must Have | 130 |
| Optional | 14 |
| Should Have | 72 |
| Supplemental | 14 |

### By Mode

| Mode | Count |
| --- | ---: |
| inference | 96 |
| training | 134 |

### By Phase

| Phase | Count |
| --- | ---: |
| Baseline profiling | 12 |
| Communication analysis | 12 |
| Data movement | 16 |
| Distributed training strategy | 20 |
| Environment validation | 9 |
| Hardware comparison | 8 |
| Inference batching | 18 |
| Inference concurrency | 15 |
| Inference framework | 9 |
| Inference multi-GPU | 7 |
| Inference precision/quantization | 12 |
| Inference prompt length | 12 |
| Memory optimisation | 27 |
| Precision study | 14 |
| Strong scaling | 14 |
| Telemetry revalidation | 5 |
| Weak scaling | 8 |
| Workload characterisation | 12 |

## Slurm Smoke Presets

| Script | Present |
| --- | --- |
| `slurm/smoke/gpt2_small_smoke.sbatch` | yes |
| `slurm/smoke/distilbert_smoke.sbatch` | yes |
| `slurm/smoke/tinyllama_inference_smoke.sbatch` | yes |

## Submission Gate

- Run `python -m hpc_ai_perf.cli validate` before submission.
- Run `python -m hpc_ai_perf.cli validate --skip-results --research-ready` for the selected batch.
- Run the three Slurm smoke presets before rendering the full matrix.
- Run `python -m hpc_ai_perf.cli refresh` after smoke results complete.
- Review `results/processed/experiment_tracker.md` and the dashboard before larger batches.
