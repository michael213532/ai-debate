"""AI Providers package."""
from .base import BaseProvider, ProviderRegistry
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider
from .google_provider import GoogleProvider
from .deepseek_provider import DeepseekProvider
from .xai_provider import XAIProvider

# Register all providers
ProviderRegistry.register("openai", OpenAIProvider)
ProviderRegistry.register("anthropic", AnthropicProvider)
ProviderRegistry.register("google", GoogleProvider)
ProviderRegistry.register("deepseek", DeepseekProvider)
ProviderRegistry.register("xai", XAIProvider)

__all__ = [
    "BaseProvider",
    "ProviderRegistry",
    "OpenAIProvider",
    "AnthropicProvider",
    "GoogleProvider",
    "DeepseekProvider",
    "XAIProvider",
]
